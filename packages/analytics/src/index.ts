import {
  CHANNEL_LABEL_FA,
  type Channel,
  type MetricRow,
  type Money,
  type SpendMode,
  type WeeklyReport,
} from '@studio/contracts';

/**
 * سنجش و گزارش (packages/analytics/README.md).
 * قواعد ثابت: مقدار ناموجود null است نه صفر؛ دادهٔ نمونه هرگز به‌عنوان واقعی نمایش داده نمی‌شود؛
 * ارزهای مختلف با هم جمع نمی‌شوند؛ نسبت با مخرج صفر یا نامعلوم N/A است.
 */

const fa = (value: number): string => new Intl.NumberFormat('fa-IR').format(value);

export interface MetricDefinition {
  label_fa: string;
  definition_fa: string;
  unit: string;
}

/** هر سنجه نام، تعریف و واحد دارد. reach و views شبکه‌های مختلف هم‌معنا فرض نمی‌شوند. */
export const METRIC_CATALOG: Readonly<Record<string, MetricDefinition>> = {
  impressions: { label_fa: 'نمایش', definition_fa: 'تعداد دفعات نمایش محتوا، طبق تعریف همان شبکه', unit: 'count' },
  reach: { label_fa: 'دسترسی', definition_fa: 'تعداد حساب‌های یکتایی که محتوا را دیده‌اند، طبق تعریف همان شبکه', unit: 'count' },
  saves: { label_fa: 'ذخیره', definition_fa: 'تعداد ذخیره‌شدن محتوا', unit: 'count' },
  shares: { label_fa: 'اشتراک‌گذاری', definition_fa: 'تعداد بازنشر یا ارسال محتوا', unit: 'count' },
  comments: { label_fa: 'کامنت', definition_fa: 'تعداد کامنت‌های دریافتی', unit: 'count' },
  profile_visits: { label_fa: 'بازدید پروفایل', definition_fa: 'بازدید پروفایل در دورهٔ گزارش', unit: 'count' },
  link_clicks: { label_fa: 'کلیک لینک', definition_fa: 'کلیک روی لینک پروفایل یا محتوا', unit: 'count' },
  retention_rate: { label_fa: 'نگهداشت ویدئو', definition_fa: 'میانگین درصد تماشای ویدئو؛ فقط اگر شبکه آن را بدهد', unit: 'percent' },
};

/** شاخص‌های کسب‌وکار؛ KPI اصلی سرنخ واجد شرایط، جلسه و قرارداد است و بازدید فقط شاخص میانی است. */
export const BUSINESS_METRICS: Readonly<Record<string, MetricDefinition>> = {
  lead: { label_fa: 'سرنخ', definition_fa: 'تماس یا پیام ورودی ثبت‌شده', unit: 'count' },
  qualified_lead: { label_fa: 'سرنخ واجد شرایط', definition_fa: 'سرنخی که با معیار مالک واجد شرایط شده است', unit: 'count' },
  booking: { label_fa: 'جلسه', definition_fa: 'جلسه یا مشاورهٔ رزروشده', unit: 'count' },
  won: { label_fa: 'قرارداد', definition_fa: 'فروش یا قرارداد قطعی', unit: 'count' },
};

export interface SnapshotRow {
  provider: string;
  channel: string | null;
  metric: string;
  value: number | null;
  unit: string;
  quality: MetricRow['quality'];
  is_sample: boolean;
  fetched_at: string;
}

/**
 * تجمیع سنجه‌ها به تفکیک کانال. دادهٔ واقعی و نمونه هرگز با هم جمع نمی‌شوند:
 * اگر برای یک سنجه دادهٔ واقعی باشد فقط همان گزارش می‌شود.
 */
export function aggregateMetrics(snapshots: readonly SnapshotRow[]): MetricRow[] {
  const groups = new Map<string, SnapshotRow[]>();
  for (const row of snapshots) {
    const key = `${row.channel ?? ''}|${row.metric}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const rows: MetricRow[] = [];
  for (const [key, group] of groups) {
    const [channel, metric] = key.split('|') as [string, string];
    const definition = METRIC_CATALOG[metric] ?? { label_fa: metric, definition_fa: 'تعریف ثبت نشده است', unit: group[0]?.unit ?? '' };
    const real = group.filter((row) => !row.is_sample && row.value !== null);
    const sample = group.filter((row) => row.is_sample && row.value !== null);
    const used = real.length > 0 ? real : sample;
    const additive = definition.unit === 'count';
    const value =
      used.length === 0
        ? null
        : additive
          ? used.reduce((sum, row) => sum + (row.value as number), 0)
          : used.reduce((sum, row) => sum + (row.value as number), 0) / used.length;
    const fetched = group.map((row) => row.fetched_at).sort().at(-1) ?? null;
    rows.push({
      metric,
      label_fa: definition.label_fa,
      definition_fa: definition.definition_fa,
      unit: definition.unit,
      channel: channel ? (channel as Channel) : null,
      value,
      quality:
        value === null
          ? 'unavailable'
          : real.length > 0
            ? real.some((row) => row.quality === 'estimated')
              ? 'estimated'
              : 'actual'
            : 'sample',
      source: [...new Set(used.length > 0 ? used.map((row) => row.provider) : group.map((row) => row.provider))].join('، '),
      fetched_at: fetched,
    });
  }
  const order = Object.keys(METRIC_CATALOG);
  return rows.sort(
    (a, b) =>
      (a.channel ?? '').localeCompare(b.channel ?? '') ||
      order.indexOf(a.metric) - order.indexOf(b.metric),
  );
}

/** نسبت امن: مخرج صفر یا نامعلوم → null (نمایش N/A). */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

export interface WeeklyReportInput {
  brand: { id: string; name: string; is_sample: boolean; timezone: string };
  week_start: string;
  week_end: string;
  generated_at: string;
  work: WeeklyReport['work'];
  snapshots: readonly SnapshotRow[];
  spend_mode: SpendMode;
  spend_totals: readonly Money[];
  has_metrics_source: boolean;
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const metrics = aggregateMetrics(input.snapshots);
  const anySample = input.brand.is_sample || metrics.some((row) => row.quality === 'sample');
  const gaps: string[] = [];
  if (!input.has_metrics_source) {
    gaps.push('هیچ اتصالی با قابلیت آزمودهٔ خواندن سنجه وجود ندارد؛ سنجه‌های شبکه‌ها در دسترس نیست.');
  } else if (metrics.length === 0) {
    gaps.push('برای این هفته هنوز سنجه‌ای جمع‌آوری نشده است؛ «جمع‌آوری سنجه» را اجرا کنید.');
  }
  for (const row of metrics) {
    if (row.value === null) {
      gaps.push(`«${row.label_fa}»${row.channel ? ` در ${CHANNEL_LABEL_FA[row.channel]}` : ''} از منبع دریافت نشد.`);
    }
  }
  gaps.push('ثبت سرنخ، جلسه و قرارداد هنوز ساخته نشده است (مرحلهٔ M6)؛ شاخص‌های کسب‌وکار در دسترس نیست.');

  const suggestions: string[] = [];
  if (input.work.needs_revision > 0) {
    suggestions.push(`${fa(input.work.needs_revision)} پیش‌نویس نیاز به اصلاح دارد؛ جاهای خالی اطلاعات را در استودیو کامل کنید.`);
  }
  if (input.work.ready_for_review > 0) {
    suggestions.push(`${fa(input.work.ready_for_review)} پیش‌نویس آمادهٔ بازبینی شماست.`);
  }
  if (input.work.overdue_entries > 0) {
    suggestions.push(`${fa(input.work.overdue_entries)} آیتم از موعد گذشته است؛ آن را دوباره زمان‌بندی یا از برنامه کنار بگذارید.`);
  }
  if (input.work.planned_entries === 0) {
    suggestions.push('برای این هفته برنامه‌ای وجود ندارد؛ «ساخت برنامهٔ هفته» را اجرا کنید.');
  }

  return {
    brand_id: input.brand.id,
    brand_name: input.brand.name,
    week_start: input.week_start,
    week_end: input.week_end,
    timezone: input.brand.timezone,
    generated_at: input.generated_at,
    is_sample: anySample,
    work: input.work,
    metrics,
    business: Object.entries(BUSINESS_METRICS).map(([metric, definition]) => ({
      metric,
      label_fa: definition.label_fa,
      definition_fa: definition.definition_fa,
      unit: definition.unit,
      channel: null,
      value: null,
      quality: 'unavailable' as const,
      source: 'ثبت سرنخ (M6)',
      fetched_at: null,
    })),
    cost: {
      spend_mode: input.spend_mode,
      totals: [...input.spend_totals],
      note_fa:
        input.spend_totals.length === 0
          ? 'در این دوره هیچ مصرف هزینه‌داری ثبت نشده است. حالت «فقط رایگان» فعال است و دفتر هزینه در مرحلهٔ M2 اضافه می‌شود.'
          : 'هر ارز جدا گزارش می‌شود و ارزها با هم جمع نمی‌شوند.',
    },
    data_gaps_fa: gaps,
    suggestions_fa: suggestions,
    fresh_at: metrics.map((row) => row.fetched_at).filter((value): value is string => value !== null).sort().at(-1) ?? null,
  };
}

const csvCell = (value: string | number | null): string => {
  if (value === null) return 'N/A';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** خروجی CSV گزارش با BOM برای خوانده‌شدن درست فارسی در Excel. مقدار ناموجود N/A است. */
export function weeklyReportToCsv(report: WeeklyReport): string {
  const lines: string[] = [];
  const push = (...cells: (string | number | null)[]): void => void lines.push(cells.map(csvCell).join(','));
  push('section', 'key', 'label', 'channel', 'value', 'unit', 'quality', 'source', 'fetched_at');
  push('meta', 'brand', report.brand_name, '', '', '', report.is_sample ? 'sample' : 'actual', '', report.generated_at);
  push('meta', 'week', `${report.week_start}..${report.week_end}`, '', '', '', '', report.timezone, '');
  for (const [key, value] of Object.entries(report.work)) push('work', key, key, '', value, 'count', 'actual', 'studio', report.generated_at);
  for (const row of [...report.metrics, ...report.business]) {
    push(
      report.business.includes(row) ? 'business' : 'metric',
      row.metric, row.label_fa, row.channel ?? '', row.value, row.unit, row.quality, row.source, row.fetched_at ?? '',
    );
  }
  for (const total of report.cost.totals) push('cost', total.currency, 'هزینه', '', total.amount_minor, total.currency, 'actual', 'ledger', '');
  return `﻿${lines.join('\r\n')}\r\n`;
}
