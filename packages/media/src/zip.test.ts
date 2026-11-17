import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildZip, crc32 } from './zip.ts';
import { readStoredZip } from './zip-reader.ts';

describe('ZIP', () => {
  it('CRC32 مقدار استاندارد', () => {
    assert.equal(crc32(Buffer.from('123456789')).toString(16), 'cbf43926');
  });

  it('ساخت و خواندن دوبارهٔ بسته با نام و متن فارسی؛ خروجی قطعی', () => {
    const entries = [
      { name: '01-cover.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
      { name: 'caption.txt', data: Buffer.from('کپشن فارسی با نیم‌فاصله\n', 'utf8') },
    ];
    const zip = buildZip(entries);
    assert.deepEqual(readStoredZip(zip), entries);
    assert.deepEqual(buildZip(entries), zip);
  });

  it('نام خطرناک یا تکراری رد می‌شود', () => {
    assert.throws(() => buildZip([{ name: '../x.txt', data: Buffer.alloc(1) }]));
    assert.throws(() => buildZip([{ name: 'a\\b.txt', data: Buffer.alloc(1) }]));
    assert.throws(() => buildZip([{ name: 'a.txt', data: Buffer.alloc(1) }, { name: 'a.txt', data: Buffer.alloc(1) }]));
  });

  it('ابزار استاندارد سیستم (tar) هم بسته را باز می‌کند', async (t) => {
    // فقط bsdtar (libarchive) ZIP می‌خواند؛ tar ویندوز همین است. نبودش skip صریح است، نه pass.
    const tar = process.platform === 'win32' ? join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar';
    const probe = spawnSync(tar, ['--version'], { encoding: 'utf8' });
    if (probe.status !== 0 || !probe.stdout.includes('bsdtar')) {
      t.skip('bsdtar در دسترس نیست');
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'studio-zip-'));
    try {
      await writeFile(join(dir, 'p.zip'), buildZip([{ name: 'hello.txt', data: Buffer.from('سلام', 'utf8') }]));
      const result = spawnSync(tar, ['-xf', 'p.zip'], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(await readFile(join(dir, 'hello.txt'), 'utf8'), 'سلام');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
