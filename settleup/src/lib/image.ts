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
