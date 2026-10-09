import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  if (name.length !== 4) throw new TypeError('PNG chunk type must be four ASCII bytes');
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const chunk = Buffer.alloc(12 + body.length);
  chunk.writeUInt32BE(body.length, 0);
  name.copy(chunk, 4);
  body.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + body.length)), 8 + body.length);
  return chunk;
}

/**
 * Builds a CRC-correct RGBA PNG. The default 1×1 image is fully decodable.
 * Non-default dimensions are used only for server header/size-limit tests; the
 * compressed IDAT remains one pixel so boundary cases never allocate huge rows.
 */
export function png(width = 1, height = 1) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixel = Buffer.from([0, 255, 0, 0, 255]); // filter byte followed by one RGBA pixel
  return Buffer.concat([
    SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(pixel)),
    pngChunk('IEND'),
  ]);
}
