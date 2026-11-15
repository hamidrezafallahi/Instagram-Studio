/**
 * ورود برند واقعی از config/brands روی PostgreSQL واقعی: ساخت، تکرار بدون نسخهٔ تازه، و به‌روزرسانی.
 * هیچ اتصال یا کلیدی ساخته نمی‌شود.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loadBrandSeeds } from '@studio/orchestration';
import { createHarness, type Harness } from '../support/harness.ts';

let harness: Harness;

before(async () => {
  harness = await createHarness({ sampleData: false });
});
after(async () => {
  await harness.close();
});

describe('brand:import', () => {
  it('برند ساخته می‌شود، ورود دوباره نسخهٔ تازه نمی‌سازد و تغییر فایل نسخهٔ تازه می‌سازد', async () => {
    const owner = await harness.owner();
    const session = owner.session;
    assert.ok(session);
    const workspace = session.workspaces[0];
    assert.ok(workspace);
    const call = {
      trace_id: 'test-brand-import',
      workspace_id: workspace.id,
      actor: { type: 'user' as const, id: session.user.id, role: 'owner' as const },
    };
    const [entry] = loadBrandSeeds();
    assert.ok(entry);

    const first = await harness.studio.brandImport.importSeed(call, entry.seed);
    assert.equal(first.outcome, 'created');
    assert.equal(first.revision, 2);

    const brand = await harness.studio.brands.get({ ...call, brand_id: first.brand_id });
    assert.equal(brand.brand.is_sample, false);
    assert.equal(brand.profile.identity.name, entry.seed.name);
    assert.equal(brand.brand.readiness.draft_ready, true);
    assert.equal((await harness.studio.connections.list({ ...call, brand_id: first.brand_id })).length, 0);

    const again = await harness.studio.brandImport.importSeed(call, entry.seed);
    assert.deepEqual(again, { ...first, outcome: 'unchanged' });

    const changed = structuredClone(entry.seed);
    changed.profile.voice = { ...changed.profile.voice!, tone: `${changed.profile.voice!.tone} (آزمون)` };
    const updated = await harness.studio.brandImport.importSeed(call, changed);
    assert.equal(updated.outcome, 'updated');
    assert.equal(updated.revision, 3);
  });
});
