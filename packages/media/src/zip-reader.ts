import { crc32 } from './zip.ts';

/** خوانندهٔ حداقلی ZIP روش store؛ فقط برای آزمون بسته‌هایی که buildZip می‌سازد. */
export function readStoredZip(zip: Buffer): { name: string; data: Buffer }[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('انتهای ZIP پیدا نشد.');
  const count = zip.readUInt16LE(end + 10);
  let pointer = zip.readUInt32LE(end + 16);
  const entries: { name: string; data: Buffer }[] = [];
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(pointer) !== 0x02014b50) throw new Error('فهرست مرکزی ZIP خراب است.');
    const crc = zip.readUInt32LE(pointer + 16);
    const size = zip.readUInt32LE(pointer + 20);
    const nameLength = zip.readUInt16LE(pointer + 28);
    const extra = zip.readUInt16LE(pointer + 30);
    const comment = zip.readUInt16LE(pointer + 32);
    const local = zip.readUInt32LE(pointer + 42);
    const name = zip.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('سرآیند محلی ZIP خراب است.');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`CRC فایل ${name} نمی‌خواند.`);
    entries.push({ name, data });
    pointer += 46 + nameLength + extra + comment;
  }
  return entries;
}
