import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  REDACTED,
  SecretScrubber,
  createLogger,
  createVault,
  dummyPasswordHash,
  generateToken,
  hashPassword,
  loadMasterKey,
  needsRehash,
  redact,
  safeEqual,
  sha256Hex,
  verifyPassword,
} from './index.ts';

describe('رمز عبور', () => {
  it('argon2id در قالب PHC هش و درست بررسی می‌شود', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(hash.includes('correct-horse'), false);
    assert.equal(await verifyPassword('correct-horse-battery-staple', hash), true);
    assert.equal(await verifyPassword('wrong-password', hash), false);
    assert.equal(needsRehash(hash), false);
  });

  it('هر هش نمک جدا دارد و قالب ناشناخته رد می‌شود', async () => {
    assert.notEqual(await hashPassword('same-password-here'), await hashPassword('same-password-here'));
    assert.equal(await verifyPassword('x', 'not-a-hash'), false);
    assert.equal(needsRehash('$argon2id$v=19$m=1024,t=1,p=1$c2FsdA$aGFzaA'), true);
    assert.match(await dummyPasswordHash(), /^\$argon2id\$/);
  });
});

describe('vault', () => {
  const binding = { workspace_id: randomUUID(), brand_id: randomUUID(), secret_id: randomUUID() };

  it('راز رمز و فقط با همان کلید و همان برند باز می‌شود', () => {
    const vault = createVault(randomBytes(32));
    const sealed = vault.seal('canary-token-123456', binding);
    assert.equal(sealed.ciphertext.includes(Buffer.from('canary-token')), false);
    assert.equal(vault.open(sealed, binding), 'canary-token-123456');
    // جابه‌جایی ciphertext به برند دیگر: AAD نمی‌خواند و باز نمی‌شود.
    assert.throws(() => vault.open(sealed, { ...binding, brand_id: randomUUID() }));
    assert.throws(() => createVault(randomBytes(32)).open(sealed, binding));
  });

  it('دست‌کاری ciphertext کشف می‌شود', () => {
    const vault = createVault(randomBytes(32));
    const sealed = vault.seal('value-to-protect', binding);
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] as number) ^ 1;
    assert.throws(() => vault.open({ ...sealed, ciphertext: tampered }, binding));
  });

  it('کلید اصلی یک‌بار در STUDIO_HOME ساخته می‌شود و مقدار تزریق‌شده مقدم است', () => {
    const home = mkdtempSync(join(tmpdir(), 'studio-key-'));
    try {
      const first = loadMasterKey(home, {});
      assert.equal(first.length, 32);
      assert.ok(existsSync(join(home, 'master.key')));
      assert.ok(loadMasterKey(home, {}).equals(first));
      const injected = randomBytes(32);
      assert.ok(loadMasterKey(home, { STUDIO_MASTER_KEY: injected.toString('base64') }).equals(injected));
      assert.throws(() => loadMasterKey(home, { STUDIO_MASTER_KEY: 'c2hvcnQ=' }));
      assert.equal(readFileSync(join(home, 'master.key'), 'utf8').trim().length, 44);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('حذف راز از log', () => {
  it('کلیدهای حساس پوشانده می‌شوند ولی ارجاع راز می‌ماند', () => {
    const out = redact({
      email: 'a@b.test',
      password: 'p4ssw0rd-very-long',
      nested: { api_key: 'k', Authorization: 'Bearer x', secret_ref: 'secret://vault/1', has_secret: true },
      list: [{ token: 't' }],
    }) as Record<string, any>;
    assert.equal(out['email'], 'a@b.test');
    assert.equal(out['password'], REDACTED);
    assert.equal(out['nested'].api_key, REDACTED);
    assert.equal(out['nested'].Authorization, REDACTED);
    assert.equal(out['nested'].secret_ref, 'secret://vault/1');
    assert.equal(out['nested'].has_secret, true);
    assert.equal(out['list'][0].token, REDACTED);
  });

  it('مقدار راز زنده از هر رشته و پیام خطا پاک می‌شود (canary)', () => {
    const scrubber = new SecretScrubber();
    const canary = `canary-${generateToken(12)}`;
    scrubber.register(canary);
    const lines: string[] = [];
    const logger = createLogger({ service: 'test', level: 'trace', scrubber, write: (line) => void lines.push(line) });
    logger.info({ note: `provider said ${canary} is invalid`, url: `https://x.invalid/?t=${canary}` }, `msg ${canary}`);
    logger.error({ err: new Error(`failed with ${canary}`) }, 'boom');
    logger.child({ run_id: 'r1' }).warn(`plain ${canary}`);
    const all = lines.join('\n');
    assert.equal(all.includes(canary), false, 'راز در log نشت کرد');
    assert.ok(all.includes(REDACTED));
    assert.equal(lines.length, 3);
    assert.equal(JSON.parse(lines[2] as string).run_id, 'r1');
  });

  it('سطح log رعایت می‌شود و stack خطا ثبت نمی‌شود', () => {
    const lines: string[] = [];
    const logger = createLogger({ service: 'test', level: 'warn', write: (line) => void lines.push(line) });
    logger.info('hidden');
    logger.error({ err: new Error('visible') }, 'shown');
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.includes('at '), false);
  });
});

describe('نشانه‌ها', () => {
  it('نشانه‌ها تصادفی‌اند و مقایسهٔ زمان‌ثابت درست کار می‌کند', () => {
    const a = generateToken();
    assert.notEqual(a, generateToken());
    assert.ok(a.length >= 43);
    assert.equal(safeEqual(a, a), true);
    assert.equal(safeEqual(a, `${a}x`), false);
    assert.match(sha256Hex(a), /^[0-9a-f]{64}$/);
  });
});
