/** Bounded container inspection; never allocates decoded pixels or transcodes artwork. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_ANIMATION_FRAMES = 300;
export const MAX_DECODED_PIXELS = 120_000_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

export function imageSignature(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.toString('latin1', 0, 6))) return 'image/gif';
  return null;
}

function invalid(format, detail) { throw new TypeError(`Invalid or truncated ${format}: ${detail}`); }
function canvas(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new TypeError('Invalid image dimensions');
  if (width * height > MAX_IMAGE_PIXELS) throw new RangeError('image exceeds 40 megapixels');
}
function budget(width, height, frames) {
  if (frames > MAX_ANIMATION_FRAMES) throw new RangeError('animation exceeds 300 frames');
  // Count complete composited canvases, including small delta frames, conservatively.
  if (width * height * frames > MAX_DECODED_PIXELS) throw new RangeError('animation exceeds 120 million decoded pixels');
}
function rect(format, width, height, x, y, cw, ch) {
  if (!width || !height || x + width > cw || y + height > ch) invalid(format, 'frame outside canvas');
}

function pngInfo(buf) {
  let off = 8, width = 0, height = 0, hasData = false, ended = false;
  let expectedFrames = 0, frameCount = 0, sequence = 0, durationMs = 0, frame = null, defaultIncluded = false;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), d = off + 8;
    if (off + 12 + len > buf.length) invalid('PNG', 'PNG chunk boundaries');
    if (crc32(buf.subarray(off + 4, d + len)) !== buf.readUInt32BE(d + len)) invalid('PNG', 'chunk CRC');
    if (off === 8 && (type !== 'IHDR' || len !== 13)) invalid('PNG', 'header');
    if (type === 'IHDR') {
      if (off !== 8 || len !== 13) invalid('PNG', 'duplicate header');
      width = buf.readUInt32BE(d); height = buf.readUInt32BE(d + 4); canvas(width, height);
    } else if (type === 'acTL') {
      if (len !== 8 || hasData || expectedFrames) invalid('APNG', 'animation control');
      expectedFrames = buf.readUInt32BE(d);
      if (!expectedFrames) invalid('APNG', 'empty animation');
      budget(width, height, expectedFrames);
    } else if (type === 'fcTL') {
      if (!expectedFrames || len !== 26 || buf.readUInt32BE(d) !== sequence++) invalid('APNG', 'frame control sequence');
      if (frame && !frame.data) invalid('APNG', 'frame missing image data');
      const w = buf.readUInt32BE(d + 4), h = buf.readUInt32BE(d + 8), x = buf.readUInt32BE(d + 12), y = buf.readUInt32BE(d + 16);
      rect('APNG', w, h, x, y, width, height);
      if (!hasData && (w !== width || h !== height || x || y)) invalid('APNG', 'default frame must fill canvas');
      if (buf[d + 24] > 2 || buf[d + 25] > 1) invalid('APNG', 'frame disposal or blend');
      if (++frameCount > expectedFrames) invalid('APNG', 'frame count mismatch');
      if (frameCount === 1) defaultIncluded = !hasData;
      durationMs += 1000 * buf.readUInt16BE(d + 20) / (buf.readUInt16BE(d + 22) || 100);
      frame = { data: false, defaultImage: !hasData };
    } else if (type === 'IDAT') {
      if (frame && !frame.defaultImage) invalid('APNG', 'IDAT after animation frame');
      if (len) { hasData = true; if (frame) frame.data = true; }
    } else if (type === 'fdAT') {
      if (!expectedFrames || !hasData || !frame || frame.defaultImage || len < 5 || buf.readUInt32BE(d) !== sequence++) invalid('APNG', 'frame data sequence');
      frame.data = true;
    } else if (type === 'IEND') {
      if (len) invalid('PNG', 'end chunk');
      ended = true; off += 12; break;
    }
    off += 12 + len;
  }
  if (!ended || !hasData || off !== buf.length) invalid('PNG', 'truncated PNG image');
  if (expectedFrames && (frameCount !== expectedFrames || !frame?.data)) invalid('APNG', 'frame count or missing data');
  // An excluded default image also has to be decoded to display the PNG fallback.
  if (expectedFrames) budget(width, height, frameCount + (defaultIncluded ? 0 : 1));
  return { mime: 'image/png', ext: 'png', width, height, animated: !!expectedFrames, frameCount: expectedFrames || 1, durationMs };
}

function gifInfo(buf) {
  if (buf.length < 14) invalid('GIF', 'header');
  const width = buf.readUInt16LE(6), height = buf.readUInt16LE(8); canvas(width, height);
  let off = 13, frames = 0, graphics = 0, durationMs = 0, delay = 0, ended = false;
  const requireBytes = n => { if (off + n > buf.length) invalid('GIF', 'block boundaries'); };
  const skipTable = packed => {
    if (packed & 0x80) { const size = 3 * (1 << ((packed & 7) + 1)); requireBytes(size); off += size; }
  };
  const subBlocks = () => {
    let bytes = 0;
    while (true) {
      requireBytes(1); const n = buf[off++];
      if (!n) return bytes;
      requireBytes(n); bytes += n; off += n;
    }
  };
  const globalTable = !!(buf[10] & 0x80); skipTable(buf[10]);
  while (off < buf.length) {
    const marker = buf[off++];
    if (marker === 0x3b) { ended = true; break; }
    if (marker === 0x21) {
      requireBytes(1); const label = buf[off++];
      if (label === 0xf9) {
        requireBytes(6);
        if (buf[off] !== 4 || buf[off + 5] !== 0 || ((buf[off + 1] >> 2) & 7) > 3) invalid('GIF', 'graphic control');
        delay = buf.readUInt16LE(off + 2) * 10; off += 6;
      } else if (label === 0x01) {
        requireBytes(13);
        if (buf[off] !== 12 || !globalTable || !buf[off + 9] || !buf[off + 10]) invalid('GIF', 'plain text header');
        rect('GIF', buf.readUInt16LE(off + 5), buf.readUInt16LE(off + 7), buf.readUInt16LE(off + 1), buf.readUInt16LE(off + 3), width, height);
        off += 13; subBlocks(); graphics++; budget(width, height, graphics);
        durationMs += delay; delay = 0;
      } else {
        // Application/comment extensions retain their original bytes.
        subBlocks();
      }
    } else if (marker === 0x2c) {
      requireBytes(9);
      const x = buf.readUInt16LE(off), y = buf.readUInt16LE(off + 2), w = buf.readUInt16LE(off + 4), h = buf.readUInt16LE(off + 6), packed = buf[off + 8];
      rect('GIF', w, h, x, y, width, height);
      if (!globalTable && !(packed & 0x80)) invalid('GIF', 'missing color table');
      off += 9; skipTable(packed); requireBytes(1);
      const codeSize = buf[off++]; if (codeSize < 2 || codeSize > 8) invalid('GIF', 'LZW code size');
      if (!subBlocks()) invalid('GIF', 'empty image data');
      frames++; graphics++; budget(width, height, graphics); durationMs += delay; delay = 0;
    } else invalid('GIF', 'unknown block');
  }
  if (!ended || !frames || off !== buf.length) invalid('GIF', 'missing trailer or image data');
  return { mime: 'image/gif', ext: 'gif', width, height, animated: frames > 1, frameCount: frames, durationMs };
}

function webpDimensions(buf, kind, d, len) {
  if (kind === 'VP8 ' && len >= 10 && buf[d + 3] === 0x9d && buf[d + 4] === 0x01 && buf[d + 5] === 0x2a) return [buf.readUInt16LE(d + 6) & 0x3fff, buf.readUInt16LE(d + 8) & 0x3fff];
  if (kind === 'VP8L' && len >= 5 && buf[d] === 0x2f) return [1 + buf[d + 1] + ((buf[d + 2] & 0x3f) << 8), 1 + (buf[d + 2] >> 6) + (buf[d + 3] << 2) + ((buf[d + 4] & 0x0f) << 10)];
  invalid('WebP', 'image bitstream header');
}
function webpChunks(buf, start, end, visit) {
  let off = start;
  while (off + 8 <= end) {
    const kind = buf.toString('latin1', off, off + 4), len = buf.readUInt32LE(off + 4), d = off + 8;
    const next = d + len + (len & 1);
    if (next > end || ((len & 1) && buf[d + len] !== 0)) invalid('WebP', 'chunk boundaries or padding');
    visit(kind, d, len, off); off = next;
  }
  if (off !== end) invalid('WebP', 'trailing chunk bytes');
}
function webpInfo(buf) {
  if (buf.length < 20 || buf.readUInt32LE(4) !== buf.length - 8) throw new TypeError('Invalid WebP RIFF size');
  let width = 0, height = 0, extended = false, animated = false, control = false, frames = 0, durationMs = 0, image = false;
  webpChunks(buf, 12, buf.length, (kind, d, len, off) => {
    if (kind === 'VP8X') {
      if (off !== 12 || extended || len !== 10) invalid('WebP', 'extended header');
      extended = true; animated = !!(buf[d] & 2);
      if ((buf[d] & 0xc1) || buf[d + 1] || buf[d + 2] || buf[d + 3]) invalid('WebP', 'reserved header flags');
      width = 1 + buf.readUIntLE(d + 4, 3); height = 1 + buf.readUIntLE(d + 7, 3); canvas(width, height);
    } else if (kind === 'ANIM') {
      if (!animated || control || frames || len !== 6) invalid('WebP', 'animation control');
      control = true;
    } else if (kind === 'ANMF') {
      if (!control || len < 24) invalid('WebP', 'frame without animation control');
      const x = buf.readUIntLE(d, 3) * 2, y = buf.readUIntLE(d + 3, 3) * 2, w = 1 + buf.readUIntLE(d + 6, 3), h = 1 + buf.readUIntLE(d + 9, 3);
      rect('WebP', w, h, x, y, width, height);
      if (buf[d + 15] & 0xfc) invalid('WebP', 'reserved frame flags');
      let frameImage = false, alpha = false;
      webpChunks(buf, d + 16, d + len, (nested, nd, nl) => {
        if (nested === 'ALPH') {
          if (alpha || frameImage || !nl) invalid('WebP', 'frame alpha');
          alpha = true;
        } else if (nested === 'VP8 ' || nested === 'VP8L') {
          if (frameImage || (alpha && nested === 'VP8L')) invalid('WebP', 'duplicate frame image');
          const [iw, ih] = webpDimensions(buf, nested, nd, nl);
          if (iw !== w || ih !== h) invalid('WebP', 'frame bitstream dimensions');
          frameImage = true;
        } else invalid('WebP', 'unsupported frame chunk');
      });
      if (!frameImage) invalid('WebP', 'frame missing image');
      frames++; budget(width, height, frames); durationMs += buf.readUIntLE(d + 12, 3);
    } else if (kind === 'VP8 ' || kind === 'VP8L') {
      if (animated || image) invalid('WebP', 'unexpected image chunk');
      const [w, h] = webpDimensions(buf, kind, d, len);
      if (extended && (w !== width || h !== height)) invalid('WebP', 'bitstream dimensions');
      width = w; height = h; canvas(width, height); image = true;
    }
  });
  if (animated ? (!control || !frames) : !image) invalid('WebP', 'missing image or animation frames');
  return { mime: 'image/webp', ext: 'webp', width, height, animated, frameCount: frames || 1, durationMs };
}

function jpegInfo(buf) {
  if (buf.length < 4 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) throw new TypeError('Invalid or truncated JPEG image');
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    while (buf[i] === 0xff) i++;
    const marker = buf[i++];
    if (marker === 0xd9 || marker === 0xda) break;
    if ([0xd8, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(marker)) continue;
    if (i + 2 > buf.length) break;
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && len >= 7) {
      const width = buf.readUInt16BE(i + 5), height = buf.readUInt16BE(i + 3); canvas(width, height);
      return { mime: 'image/jpeg', ext: 'jpg', width, height, animated: false, frameCount: 1, durationMs: 0 };
    }
    i += len;
  }
  throw new TypeError('Invalid or unsupported JPEG image');
}

export function inspectImage(input) {
  const buf = Buffer.isBuffer(input) ? input : input instanceof Uint8Array ? Buffer.from(input) : null;
  if (!buf || !buf.length) throw new TypeError('asset must be a non-empty byte buffer');
  if (buf.length > MAX_IMAGE_BYTES) throw new RangeError('asset exceeds 10 MiB');
  switch (imageSignature(buf)) {
    case 'image/png': return pngInfo(buf);
    case 'image/gif': return gifInfo(buf);
    case 'image/webp': return webpInfo(buf);
    case 'image/jpeg': return jpegInfo(buf);
    default: throw new TypeError('Unsupported image format; use JPEG, PNG/APNG, GIF, or WebP');
  }
}
