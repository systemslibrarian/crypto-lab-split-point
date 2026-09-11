export const RECORD_BYTES = 16;

export function makeRecord(index: number, width = RECORD_BYTES): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new RangeError('record index must be an unsigned 32-bit integer');
  }
  if (!Number.isInteger(width) || width < 4) {
    throw new RangeError('record width must be at least 4 bytes');
  }
  const record = new Uint8Array(width);
  new DataView(record.buffer).setUint32(0, index);
  let state = (index ^ 0x9e37_79b9) >>> 0;
  for (let offset = 4; offset < width; offset += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    record[offset] = state & 0xff;
  }
  return record;
}

export function createShelf(size: number, width = RECORD_BYTES): Uint8Array[] {
  if (!Number.isInteger(size) || size < 1 || (size & (size - 1)) !== 0) {
    throw new RangeError('shelf size must be a positive power of two');
  }
  return Array.from({ length: size }, (_, index) => makeRecord(index, width));
}

export function recordIndex(record: Uint8Array): number {
  if (record.length < 4) throw new RangeError('record must contain its 4-byte index');
  return new DataView(record.buffer, record.byteOffset, record.byteLength).getUint32(0);
}