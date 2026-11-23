import { IMAGE_MIME_TYPES } from '@pausa/shared';

/**
 * D-28: JPEG and PNG are re-encoded through a canvas before upload, which drops EXIF (GPS included).
 * createImageBitmap applies the EXIF orientation, so the result is already the right way up.
 * GIF (animation) and WebP are uploaded untouched.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, file.type === 'image/jpeg' ? 0.9 : undefined),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export function isAcceptedImage(file: File): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}
