import type { ImageMime } from '@pausa/shared';

/** Decides the type from magic bytes only (SPEC §3.4, §7.7). Extensions and Content-Type are ignored. */
export function sniffImage(head: Buffer): ImageMime | null {
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return 'image/jpeg';
  if (head.length >= 6 && /^GIF8[79]a$/.test(head.subarray(0, 6).toString('latin1')))
    return 'image/gif';
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Width/height from the file header; null if it can't be read (the image is still accepted). */
export function imageSize(buf: Buffer, mime: ImageMime): { width: number; height: number } | null {
  try {
    switch (mime) {
      case 'image/png':
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      case 'image/gif':
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
      case 'image/webp': {
        const chunk = buf.subarray(12, 16).toString('latin1');
        if (chunk === 'VP8 ')
          return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        if (chunk === 'VP8L') {
          const b = buf.subarray(21, 25);
          return {
            width: 1 + (((b[1]! & 0x3f) << 8) | b[0]!),
            height: 1 + (((b[3]! & 0x0f) << 10) | (b[2]! << 2) | ((b[1]! & 0xc0) >> 6)),
          };
        }
        if (chunk === 'VP8X')
          return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
        return null;
      }
      case 'image/jpeg': {
        let offset = 2;
        while (offset + 9 < buf.length) {
          if (buf[offset] !== 0xff) return null;
          const marker = buf[offset + 1]!;
          if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            offset += 2;
            continue;
          }
          const isSof =
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc;
          if (isSof)
            return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
          offset += 2 + buf.readUInt16BE(offset + 2);
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}
