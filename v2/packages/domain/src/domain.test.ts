import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ContentState, StudioError, type BrandProfile, type IndustryPack } from '@studio/contracts';
import { loadIndustryPacks } from '@studio/config';
import {
  CONTENT_EDITABLE_STATES,
  actionMachine,
  assertTransition,
  assessReadiness,
  buildInitialProfile,
  canTransition,
  canonicalJson,
  contentMachine,
  dateOfWeekday,
  findOwnerInputMarkers,
  findTypographyIssues,
  fundingRequestMachine,
  hashContentRevision,
  hashObject,
  isTerminal,
  localToUtc,
  normalizePersian,
  ownerInputMarker,
  runMachine,
  todayIn,
  utcToLocal,
  validateProfile,
  weekBoundsUtc,
  weekStartOf,
  weekdayOf,
} from './index.ts';

const packs = loadIndustryPacks();
const webPack = packs.get('web-services') as IndustryPack;

describe('ماشین حالت محتوا', () => {
  it('مسیر اصلی از بریف تا انتشار مجاز است', () => {
    const path: ContentState[] = [
      'brief', 'researching', 'drafting', 'validating', 'ready_for_review', 'approved', 'scheduled',
      'publishing', 'published',
    ];
    for (let index = 1; index < path.length; index += 1) {
      assert.ok(canTransition(contentMachine, path[index - 1] as ContentState, path[index] as ContentState));
    }
  });

  it('انتقال غیرمجاز با INVALID_TRANSITION رد می‌شود', () => {
    assert.throws(
      () => assertTransition(contentMachine, 'brief', 'published'),
      (error: unknown) => error instanceof StudioError && error.code === 'INVALID_TRANSITION',
    );
    assert.equal(canTransition(contentMachine, 'ready_for_review', 'published'), false);
    assert.equal(canTransition(contentMachine, 'drafting', 'approved'), false);
  });

  it('نتیجهٔ نامعلوم انتشار هرگز مستقیم به publishing برنمی‌گردد (بدون retry کور)', () => {
    assert.equal(canTransition(contentMachine, 'publishing_unknown', 'publishing'), false);
    assert.ok(canTransition(contentMachine, 'publishing_unknown', 'published'));
    assert.ok(canTransition(contentMachine, 'publishing_unknown', 'failed'));
  });

  it('ویرایش پس از تأیید محتوا را به بازبینی برمی‌گرداند', () => {
    assert.ok(canTransition(contentMachine, 'approved', 'validating'));
    assert.ok(canTransition(contentMachine, 'scheduled', 'validating'));
    assert.ok(CONTENT_EDITABLE_STATES.includes('approved'));
    assert.equal(CONTENT_EDITABLE_STATES.includes('publishing'), false);
    assert.equal(CONTENT_EDITABLE_STATES.includes('published'), false);
  });

  it('وضعیت‌های پایانی خروجی ندارند و همهٔ وضعیت‌های قرارداد در جدول هستند', () => {
    assert.ok(isTerminal(contentMachine, 'published'));
    assert.ok(isTerminal(contentMachine, 'cancelled'));
    for (const state of ContentState.options) assert.ok(contentMachine.transitions[state] !== undefined, state);
  });
});

describe('ماشین حالت اجرا، اقدام و درخواست هزینه', () => {
  it('waiting_for_approval شکست نیست و به اجرا برمی‌گردد', () => {
    assert.ok(canTransition(runMachine, 'running', 'waiting_for_approval'));
    assert.ok(canTransition(runMachine, 'waiting_for_approval', 'running'));
    assert.equal(isTerminal(runMachine, 'waiting_for_approval'), false);
  });

  it('اقدام بدون مجوز اجرا نمی‌شود و نتیجهٔ نامعلوم به اجرای دوباره نمی‌رود', () => {
    assert.equal(canTransition(actionMachine, 'proposed', 'executing'), false);
    assert.equal(canTransition(actionMachine, 'awaiting_approval', 'executing'), false);
    assert.equal(canTransition(actionMachine, 'unknown', 'executing'), false);
    assert.ok(canTransition(actionMachine, 'unknown', 'manual_required'));
  });

  it('شارژشدن اعتبار پایان چرخهٔ درخواست است، نه مجوز انتشار', () => {
    assert.ok(canTransition(fundingRequestMachine, 'verifying', 'funded'));
    assert.ok(isTerminal(fundingRequestMachine, 'funded'));
    assert.equal(canTransition(fundingRequestMachine, 'proposed', 'funded'), false);
  });
});

describe('هش و JSON قطعی', () => {
  it('ترتیب کلیدها هش را عوض نمی‌کند', () => {
    assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
    assert.equal(hashObject({ a: 1, b: 2 }), hashObject({ b: 2, a: 1 }));
  });

  it('هر تغییر متن، دارایی یا ادعا هش نسخه را عوض می‌کند', () => {
    const base = { text: 'متن', asset_ids: [], source_refs: [], claims: [] };
    const hash = hashContentRevision(base);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hashContentRevision({ ...base, text: 'متن.' }), hash);
    assert.notEqual(hashContentRevision({ ...base, asset_ids: ['00000000-0000-7000-8000-000000000001'] }), hash);
    assert.equal(hashContentRevision({ ...base }), hash);
  });
});

describe('زمان و تقویم', () => {
  it('هفته از شنبه شروع می‌شود', () => {
    assert.equal(weekdayOf('2026-11-14'), 'saturday');
    assert.equal(weekStartOf('2026-11-11', 'saturday'), '2026-11-07');
    assert.equal(weekStartOf('2026-11-14', 'saturday'), '2026-11-14');
    assert.equal(weekStartOf('2026-11-13', 'saturday'), '2026-11-07');
    assert.equal(weekStartOf('2026-11-11', 'monday'), '2026-11-09');
  });

  it('روز هفته درون هفتهٔ برند به تاریخ درست نگاشت می‌شود', () => {
    assert.equal(dateOfWeekday('2026-11-07', 'saturday'), '2026-11-07');
    assert.equal(dateOfWeekday('2026-11-07', 'sunday'), '2026-11-08');
    assert.equal(dateOfWeekday('2026-11-07', 'friday'), '2026-11-13');
  });

  it('ساعت محلی تهران به UTC تبدیل و برعکس می‌شود', () => {
    assert.equal(localToUtc('2026-11-14', '09:30', 'Asia/Tehran'), '2026-11-14T06:00:00.000Z');
    assert.equal(localToUtc('2026-11-14', '01:00', 'Asia/Tehran'), '2026-11-13T21:30:00.000Z');
    assert.deepEqual(utcToLocal('2026-11-13T21:30:00.000Z', 'Asia/Tehran'), { date: '2026-11-14', time: '01:00' });
    assert.deepEqual(weekBoundsUtc('2026-11-07', 'Asia/Tehran'), {
      start: '2026-11-06T20:30:00.000Z',
      end: '2026-11-13T20:30:00.000Z',
    });
  });

  it('«امروز» به وقت برند محاسبه می‌شود، نه وقت سرور', () => {
    assert.equal(todayIn('Asia/Tehran', new Date('2026-11-11T21:00:00Z')), '2026-11-12');
    assert.equal(todayIn('UTC', new Date('2026-11-11T21:00:00Z')), '2026-11-11');
  });

  it('منطقهٔ زمانی و ساعت نامعتبر رد می‌شود', () => {
    assert.throws(() => localToUtc('2026-11-14', '09:30', 'Mars/Olympus'));
    assert.throws(() => localToUtc('2026-11-14', '25:00', 'Asia/Tehran'));
    assert.throws(() => weekStartOf('2026-13-40', 'saturday'));
  });
});

describe('متن فارسی', () => {
  it('حروف عربی یکسان می‌شوند و ایرادهای نگارشی گزارش می‌شوند', () => {
    assert.equal(normalizePersian('كتاب علي'), 'کتاب علی');
    const ids = findTypographyIssues('این کتاب ها می شود, درست؟').map((issue) => issue.id);
    assert.ok(ids.includes('ha_suffix_space'));
    assert.ok(ids.includes('mi_prefix_space'));
    assert.ok(ids.includes('latin_punctuation'));
  });

  it('متن درست با نیم‌فاصله ایراد ندارد', () => {
    assert.deepEqual(findTypographyIssues('این کتاب‌ها خوانده می‌شود؛ درست است.'), []);
  });

  it('علامت جای خالی اطلاعات مالک قابل شناسایی است', () => {
    const text = `شروع ${ownerInputMarker('مشخصات دقیق')} پایان`;
    assert.deepEqual(findOwnerInputMarkers(text), ['اطلاعات مالک لازم است: مشخصات دقیق']);
    assert.deepEqual(findOwnerInputMarkers('متن کامل'), []);
  });
});

describe('سند برند', () => {
  const profile = (): BrandProfile => buildInitialProfile(webPack, { name: '  برند آزمون ' });

  it('سند اولیه از بستهٔ صنعت کپی می‌شود و مستقل از آن است', () => {
    const first = profile();
    assert.equal(first.identity.name, 'برند آزمون');
    assert.equal(first.timezone, 'Asia/Tehran');
    assert.equal(first.week_start, 'saturday');
    assert.equal(first.cadence.length, webPack.default_cadence.length);
    first.cadence[0]!.time = '23:59';
    assert.notEqual(webPack.default_cadence[0]!.time, '23:59');
  });

  it('حداقل اطلاعات draft: نام، خدمت، مخاطب و زبان', () => {
    const value = profile();
    const before = assessReadiness(value, webPack);
    assert.equal(before.draft_ready, false);
    assert.equal(before.missing_for_draft.length, 2);
    value.offers.push({ id: 'shop', title: 'فروشگاه', kind: 'service' });
    value.audience.summary = 'کسب‌وکارهای کوچک';
    const after = assessReadiness(value, webPack);
    assert.equal(after.draft_ready, true);
    assert.ok(after.missing_pack_fields.includes('services'));
    assert.equal(after.missing_for_live.length, 3);
  });

  it('سند ناسازگار با بستهٔ صنعت با مسیر دقیق رد می‌شود', () => {
    const value = profile();
    value.cadence.push({ weekday: 'friday', channel: 'instagram', format: 'post', pillar: 'no_such', time: '10:00' });
    value.offers.push({ id: 'a', title: 'الف', kind: 'service', price: { amount_minor: 100, currency: 'IRT' } });
    value.pack_fields['unknown_field'] = 'x';
    assert.throws(
      () => validateProfile(value, webPack),
      (error: unknown) => {
        assert.ok(error instanceof StudioError);
        const paths = (error.details ?? []).map((detail) => detail.path);
        assert.ok(paths.some((path) => path.endsWith('.pillar')));
        assert.ok(paths.includes('offers.0.price_checked_at'), 'قیمت بدون تاریخ بررسی باید رد شود');
        assert.ok(paths.includes('pack_fields.unknown_field'));
        return error.code === 'VALIDATION_FAILED';
      },
    );
  });

  it('بستهٔ صنعت برند قابل تعویض نیست', () => {
    const value = profile();
    assert.throws(() => validateProfile(value, packs.get('generic') as IndustryPack));
  });
});
