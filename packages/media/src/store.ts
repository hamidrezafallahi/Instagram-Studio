import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{2})\/([0-9a-f]{64})$/;

export interface StoredFile {
  storage_key: string;
  checksum: string;
  byte_size: number;
}

/**
 * ذخیرهٔ محتوامحور دارایی‌ها زیر STUDIO_HOME/assets (خارج از مخزن).
 * کلید: <workspace>/<brand>/<دو حرف اول sha256>/<sha256>. فایل immutable است: محتوای تازه = کلید تازه.
 * پوشهٔ هر برند جداست تا export یا حذف یک برند به برند دیگر دست نزند (A19).
 */
export class AssetStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  static checksum(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /** مسیر فایل از کلید؛ کلید نامعتبر یا خارج از ریشه رد می‌شود (بدون path traversal). */
  pathOf(storageKey: string): string {
    const match = KEY.exec(storageKey);
    if (!match || match[3] !== match[4]?.slice(0, 2)) throw new Error('کلید ذخیرهٔ دارایی نامعتبر است.');
    const path = resolve(this.root, ...storageKey.split('/'));
    if (!path.startsWith(this.root + sep)) throw new Error('کلید ذخیرهٔ دارایی نامعتبر است.');
    return path;
  }

  async put(workspaceId: string, brandId: string, data: Buffer): Promise<StoredFile> {
    if (!UUID.test(workspaceId) || !UUID.test(brandId)) throw new Error('شناسهٔ فضای کاری یا برند نامعتبر است.');
    const checksum = AssetStore.checksum(data);
    const storage_key = `${workspaceId.toLowerCase()}/${brandId.toLowerCase()}/${checksum.slice(0, 2)}/${checksum}`;
    const path = this.pathOf(storage_key);
    const existing = await stat(path).catch(() => null);
    if (!existing || existing.size !== data.length) {
      await mkdir(dirname(path), { recursive: true });
      // نوشتن اتمی: فایل موقت و سپس rename، تا خواننده هرگز فایل نیمه‌کاره نبیند.
      const temp = join(dirname(path), `.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, data, { flag: 'wx' });
        await rename(temp, path);
      } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
      }
    }
    return { storage_key, checksum, byte_size: data.length };
  }

  /** خواندن و بررسی دوبارهٔ checksum؛ فایل دست‌کاری‌شده تحویل داده نمی‌شود. */
  async read(storageKey: string, expectedChecksum: string): Promise<Buffer> {
    const data = await readFile(this.pathOf(storageKey));
    if (AssetStore.checksum(data) !== expectedChecksum) {
      throw new Error('checksum فایل دارایی با ثبت پایگاه داده نمی‌خواند.');
    }
    return data;
  }
}
