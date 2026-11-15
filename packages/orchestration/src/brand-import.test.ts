/**
 * فایل‌های config/brands معتبرند و با همان قاعده‌های ذخیرهٔ عادی برند ساخته می‌شوند (بدون پایگاه داده).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { editorQa } from '@studio/agents';
import { loadIndustryPacks } from '@studio/config';
import { assessReadiness } from '@studio/domain';
import { buildSeedProfile, loadBrandSeeds } from './brand-import.ts';

const packs = loadIndustryPacks();

describe('ورود برند از config/brands', () => {
  const seeds = loadBrandSeeds();

  it('هر فایل برند معتبر است و با بستهٔ صنعتش سازگار است', () => {
    assert.ok(seeds.length >= 1);
    for (const { file, seed } of seeds) {
      const pack = packs.get(seed.industry_pack_id);
      assert.ok(pack, `${file}: بستهٔ صنعت ${seed.industry_pack_id} پیدا نشد`);
      const profile = buildSeedProfile(seed, pack);
      assert.equal(profile.identity.name, seed.name);
      assert.equal(profile.industry_pack.id, pack.id);
      // دادهٔ واقعی برند نباید برچسب نمونه یا قیمت بی‌تاریخ داشته باشد.
      assert.ok(profile.offers.every((offer) => !offer.is_sample && !offer.price));
      assert.equal(assessReadiness(profile, pack).draft_ready, true, file);
    }
  });

  it('برند منتقل‌شده از v1 فقط اینستاگرام را فعال دارد و فهرست ممنوع آن در QA اعمال می‌شود', () => {
    const entry = seeds.find(({ seed }) => seed.name.startsWith('حمیدرضا فلاحی'));
    assert.ok(entry, 'فایل برند حمیدرضا فلاحی پیدا نشد');
    const pack = packs.get(entry.seed.industry_pack_id);
    assert.ok(pack);
    const profile = buildSeedProfile(entry.seed, pack);
    const enabled = Object.entries(profile.channels).filter(([, setting]) => setting?.enabled).map(([channel]) => channel);
    assert.deepEqual(enabled, ['instagram']);
    assert.ok(profile.cadence.every((slot) => slot.channel === 'instagram' && slot.time === '20:30'));
    // فیلدهایی که در v1 تأیید نشده بودند عمداً خالی‌اند تا «اطلاعات مالک لازم است» دیده شود.
    const missing = assessReadiness(profile, pack).missing_pack_fields;
    assert.ok(missing.includes('stacks') && missing.includes('meeting'));

    const qa = editorQa.template({
      text: 'در دنیای امروز سایت شما باید سریع باشد.',
      format: 'carousel',
      cta_fa: '',
      profile,
      pack,
      is_sample: false,
      checked_at: '2026-11-15T08:00:00.000Z',
    });
    assert.equal(qa.qa_result.status, 'fail');
    assert.ok(qa.claims.some((claim) => claim.status === 'forbidden'));
  });
});
