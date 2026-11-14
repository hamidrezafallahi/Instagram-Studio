import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Envelope encryption (packages/security/README.md):
 * هر راز با یک کلید دادهٔ تصادفی (DEK) و AES-256-GCM رمز می‌شود؛ DEK با کلید اصلی (KEK) بسته می‌شود.
 * کلید اصلی بیرون از پایگاه داده است: در local فایل محدود در STUDIO_HOME و در server مقدار تزریق‌شده.
 * AAD راز را به workspace، برند و شناسهٔ خودش می‌بندد تا جابه‌جایی ciphertext بین برندها ناممکن شود.
 */

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const FORMAT_VERSION = 1;

export interface SealedSecret {
  ciphertext: Buffer;
  wrapped_key: Buffer;
  key_version: number;
}

export interface SecretBinding {
  workspace_id: string;
  brand_id: string;
  secret_id: string;
}

function seal(key: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_VERSION]), nonce, cipher.getAuthTag(), body]);
}

function open(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  if (sealed.length < 1 + NONCE_LENGTH + TAG_LENGTH || sealed[0] !== FORMAT_VERSION) {
    throw new Error('قالب دادهٔ رمزشده ناشناخته است.');
  }
  const nonce = sealed.subarray(1, 1 + NONCE_LENGTH);
  const tag = sealed.subarray(1 + NONCE_LENGTH, 1 + NONCE_LENGTH + TAG_LENGTH);
  const body = sealed.subarray(1 + NONCE_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

const bindingAad = (binding: SecretBinding): Buffer =>
  Buffer.from(`${binding.workspace_id}:${binding.brand_id}:${binding.secret_id}`, 'utf8');

export class Vault {
  readonly #keys: Map<number, Buffer>;
  readonly #currentVersion: number;

  constructor(keys: Map<number, Buffer>, currentVersion: number) {
    const current = keys.get(currentVersion);
    if (!current) throw new Error('کلید اصلی نسخهٔ جاری در دسترس نیست.');
    for (const key of keys.values()) {
      if (key.length !== KEY_LENGTH) throw new Error('کلید اصلی باید ۳۲ بایت باشد.');
    }
    this.#keys = keys;
    this.#currentVersion = currentVersion;
  }

  seal(plaintext: string, binding: SecretBinding): SealedSecret {
    const aad = bindingAad(binding);
    const dataKey = randomBytes(KEY_LENGTH);
    try {
      return {
        ciphertext: seal(dataKey, Buffer.from(plaintext, 'utf8'), aad),
        wrapped_key: seal(this.#keys.get(this.#currentVersion) as Buffer, dataKey, aad),
        key_version: this.#currentVersion,
      };
    } finally {
      dataKey.fill(0);
    }
  }

  open(sealed: SealedSecret, binding: SecretBinding): string {
    const master = this.#keys.get(sealed.key_version);
    if (!master) throw new Error(`کلید اصلی نسخهٔ ${sealed.key_version} در دسترس نیست.`);
    const aad = bindingAad(binding);
    const dataKey = open(master, sealed.wrapped_key, aad);
    try {
      return open(dataKey, sealed.ciphertext, aad).toString('utf8');
    } finally {
      dataKey.fill(0);
    }
  }

  /** برای چرخش کلید: DEK با کلید جاری دوباره بسته می‌شود و ciphertext دست‌نخورده می‌ماند. */
  rewrap(sealed: SealedSecret, binding: SecretBinding): SealedSecret {
    const master = this.#keys.get(sealed.key_version);
    if (!master) throw new Error(`کلید اصلی نسخهٔ ${sealed.key_version} در دسترس نیست.`);
    const aad = bindingAad(binding);
    const dataKey = open(master, sealed.wrapped_key, aad);
    try {
      return {
        ciphertext: sealed.ciphertext,
        wrapped_key: seal(this.#keys.get(this.#currentVersion) as Buffer, dataKey, aad),
        key_version: this.#currentVersion,
      };
    } finally {
      dataKey.fill(0);
    }
  }
}

/**
 * کلید اصلی را برمی‌گرداند:
 * - اگر STUDIO_MASTER_KEY تزریق شده باشد (پروفایل server) همان استفاده می‌شود؛
 * - وگرنه فایل STUDIO_HOME/master.key خوانده یا یک‌بار ساخته می‌شود (پروفایل local).
 * مقدار کلید هرگز چاپ یا log نمی‌شود.
 */
export function loadMasterKey(home: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  const injected = env['STUDIO_MASTER_KEY'];
  if (injected) {
    const key = Buffer.from(injected, 'base64');
    if (key.length !== KEY_LENGTH) throw new Error('STUDIO_MASTER_KEY باید ۳۲ بایت base64 باشد.');
    return key;
  }
  const file = join(home, 'master.key');
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (key.length !== KEY_LENGTH) throw new Error(`${file}: کلید اصلی خراب است.`);
    return key;
  }
  mkdirSync(home, { recursive: true });
  const key = randomBytes(KEY_LENGTH);
  writeFileSync(file, `${key.toString('base64')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  if (process.platform !== 'win32') chmodSync(file, 0o600);
  return key;
}

export function createVault(masterKey: Buffer, keyVersion = 1): Vault {
  return new Vault(new Map([[keyVersion, masterKey]]), keyVersion);
}
