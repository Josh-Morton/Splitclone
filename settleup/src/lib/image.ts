"use client";

/**
 * Client-side receipt compression (scope §14 #7: compress client-side, one
 * image per expense): downscale to max 1280px and re-encode as JPEG so
 * uploads stay well under the bucket's 2MB limit on any phone camera.
 */

export async function compressImage(file: File, maxDim = 1280, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Could not process the image");
  return blob;
}

/**
 * Profile photo: centre-cropped to a square, resized to `size`, JPEG.
 *
 * The crop is automatic — the largest centred square — rather than an
 * interactive cropper: faces are almost always centred in a selfie or a
 * phone-library photo, and it keeps adding a photo to a single tap. ~256px is
 * plenty for the largest avatar the app shows (64px) on a 3x screen, and keeps
 * each file around 20–40 KB.
 */
export async function squareAvatar(file: File, size = 256, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image"))), "image/jpeg", quality)
  );
}
