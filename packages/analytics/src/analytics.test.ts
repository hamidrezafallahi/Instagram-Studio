import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WeeklyReport } from '@studio/contracts';
import { aggregateMetrics, buildWeeklyReport, ratio, weeklyReportToCsv, type SnapshotRow } from './index.ts';

const row = (overrides: Partial<SnapshotRow>): SnapshotRow => ({
  provider: 'fake',
  channel: 'instagram',
  metric: 'impressions',
  value: 100,
  unit: 'count',
  quality: 'sample',
  is_sample: true,
  fetched_at: '2026-11-11T08:00:00.000Z',
  ...overrides,
});

const work = { planned_entries: 5, drafts_created: 3, ready_for_review: 2, needs_revision: 1, published: 0, overdue_entries: 1 };
const input = (snapshots: SnapshotRow[], isSampleBrand = false) => ({
  brand: { id: '00000000-0000-7000-8000-000000000001', name: 'برند', is_sample: isSampleBrand, timezone: 'Asia/Tehran' },
  week_start: '2026-11-07',
  week_end: '2026-11-13',
  generated_at: '2026-11-11T08:00:00.000Z',
  work,
  snapshots,
  spend_mode: 'free_only' as const,
  spend_totals: [],
  has_metrics_source: snapshots.length > 0,
});

describe('تجمیع سنجه', () => {
  it('A21 — مقدار ناموجود null می‌ماند و هرگز صفر نمی‌شود', () => {
    const rows = aggregateMetrics([row({ metric: 'retention_rate', value: null, unit: 'percent', quality: 'unavailable' })]);
    assert.equal(rows[0]?.value, null);
    assert.equal(rows[0]?.quality, 'unavailable');
  });

  it('دادهٔ واقعی و نمونه با هم جمع نمی‌شوند', () => {
    const rows = aggregateMetrics([
      row({ value: 1000, is_sample: true, quality: 'sample' }),
      row({ value: 40, is_sample: false, quality: 'actual', provider: 'instagram' }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.value, 40);
    assert.equal(rows[0]?.quality, 'actual');
    assert.equal(rows[0]?.source, 'instagram');
  });

  it('سنجهٔ شمارشی جمع و سنجهٔ درصدی میانگین می‌شود؛ کانال‌ها جدا می‌مانند', () => {
    const rows = aggregateMetrics([
      row({ value: 10 }),
      row({ value: 15 }),
      row({ channel: 'linkedin', value: 7 }),
      row({ metric: 'retention_rate', unit: 'percent', value: 40 }),
      row({ metric: 'retention_rate', unit: 'percent', value: 60 }),
    ]);
    assert.equal(rows.find((item) => item.channel === 'instagram' && item.metric === 'impressions')?.value, 25);
    assert.equal(rows.find((item) => item.channel === 'linkedin')?.value, 7);
    assert.equal(rows.find((item) => item.metric === 'retention_rate')?.value, 50);
  });

  it('نسبت با مخرج صفر یا نامعلوم N/A است', () => {
    assert.equal(ratio(5, 0), null);
    assert.equal(ratio(5, null), null);
    assert.equal(ratio(null, 10), null);
    assert.equal(ratio(5, 10), 0.5);
  });
});

describe('گزارش هفتگی', () => {
  it('گزارش با قرارداد می‌خواند، برچسب sample دارد و کمبود داده را صریح می‌گوید', () => {
    const report = buildWeeklyReport(
      input([row({}), row({ metric: 'retention_rate', value: null, unit: 'percent', quality: 'unavailable' })]),
    );
    assert.equal(WeeklyReport.safeParse(report).success, true);
    assert.equal(report.is_sample, true);
    assert.ok(report.data_gaps_fa.some((gap) => gap.includes('نگهداشت')));
    assert.ok(report.business.every((item) => item.value === null), 'شاخص کسب‌وکار ساخته نشود');
    assert.deepEqual(report.cost.totals, []);
    assert.ok(report.suggestions_fa.length >= 3);
  });

  it('بدون منبع سنجه هیچ عددی ساخته نمی‌شود', () => {
    const report = buildWeeklyReport(input([]));
    assert.deepEqual(report.metrics, []);
    assert.equal(report.is_sample, false);
    assert.equal(report.fresh_at, null);
    assert.ok(report.data_gaps_fa[0]?.includes('هیچ اتصالی'));
  });

  it('برند نمونه حتی بدون سنجه برچسب sample می‌گیرد', () => {
    assert.equal(buildWeeklyReport(input([], true)).is_sample, true);
  });

  it('ارزهای مختلف جدا می‌مانند', () => {
    const report = buildWeeklyReport({
      ...input([]),
      spend_totals: [
        { amount_minor: 500_000, currency: 'IRT' },
        { amount_minor: 1200, currency: 'USD' },
      ],
    });
    assert.equal(report.cost.totals.length, 2);
    assert.ok(report.cost.note_fa.includes('جدا'));
  });

  it('CSV با BOM و N/A برای مقدار ناموجود ساخته می‌شود', () => {
    const csv = weeklyReportToCsv(
      buildWeeklyReport(input([row({ metric: 'retention_rate', value: null, unit: 'percent', quality: 'unavailable' })])),
    );
    assert.ok(csv.startsWith('﻿'));
    const line = csv.split('\r\n').find((item) => item.startsWith('metric,retention_rate'));
    assert.ok(line?.includes(',N/A,percent,unavailable'), line ?? 'سطر retention_rate در CSV نیست');
    assert.equal(csv.includes(',0,percent'), false);
    assert.ok(csv.includes('business,qualified_lead'));
  });
});
