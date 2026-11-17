import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AssetStore, sniffMedia } from './index.ts';
import { tinyJpeg, tinyPng } from './fixtures.ts';

describe('sniffMedia', () => {
  it('PNG و ابعاد آن را از محتوا می‌شناسد', () => {
    assert.deepEqual(sniffMedia(tinyPng(1080, 1350)), {
      mime: 'image/png', family: 'image', ext: 'png', width: 1080, height: 1350,
    });
  });

  it('JPEG و ابعاد آن را می‌شناسد', () => {
    const result = sniffMedia(tinyJpeg(640, 480));
    assert.equal(result?.mime, 'image/jpeg');
    assert.equal(result?.width, 640);
    assert.equal(result?.height, 480);
  });

  it('WebP از نوع VP8X', () => {
    const buf = Buffer.alloc(30);
    buf.write('RIFF', 0, 'latin1');
    buf.write('WEBP', 8, 'latin1');
    buf.write('VP8X', 12, 'latin1');
    buf.writeUIntLE(799, 24, 3);
    buf.writeUIntLE(599, 27, 3);
    assert.deepEqual(sniffMedia(buf), { mime: 'image/webp', family: 'image', ext: 'webp', width: 800, height: 600 });
  });

  it('MP4 و فونت', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom0000', 'latin1')]);
    assert.equal(sniffMedia(mp4)?.mime, 'video/mp4');
    assert.equal(sniffMedia(Buffer.from('wOF2\0\0\0\0\0\0\0\0', 'latin1'))?.family, 'font');
  });

  it('SVG، HTML، اجرایی و فایل با پسوند جعلی رد می‌شوند', () => {
    assert.equal(sniffMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')), null);
    assert.equal(sniffMedia(Buffer.from('<!doctype html><html></html>')), null);
    assert.equal(sniffMedia(Buffer.from('MZ\x90\0\x03\0\0\0\x04\0\0\0', 'latin1')), null);
    assert.equal(sniffMedia(Buffer.alloc(4)), null);
  });
});

describe('AssetStore', () => {
  const ws = '0190d5a0-0000-7000-8000-000000000001';
  const brand = '0190d5a0-0000-7000-8000-000000000002';

  it('ذخیرهٔ محتوامحور، تکرار بی‌اثر و بررسی checksum هنگام خواندن', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-assets-'));
    try {
      const store = new AssetStore(root);
      const data = tinyPng(10, 10);
      const first = await store.put(ws, brand, data);
      const second = await store.put(ws, brand, data);
      assert.deepEqual(first, second);
      assert.match(first.storage_key, new RegExp(`^${ws}/${brand}/[0-9a-f]{2}/[0-9a-f]{64}$`));
      assert.deepEqual(await store.read(first.storage_key, first.checksum), data);

      await writeFile(store.pathOf(first.storage_key), Buffer.from('tampered'));
      await assert.rejects(store.read(first.storage_key, first.checksum), /checksum/);
      assert.ok((await readFile(store.pathOf(first.storage_key))).length > 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('کلید دست‌کاری‌شده یا خروج از ریشه رد می‌شود', () => {
    const store = new AssetStore(join(tmpdir(), 'x'));
    assert.throws(() => store.pathOf('../../etc/passwd'));
    assert.throws(() => store.pathOf(`${ws}/${brand}/ab/${'cd'.repeat(32)}`));
  });
});
