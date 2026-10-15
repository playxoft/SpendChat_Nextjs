"use client";

/**
 * A logo as bytes a PDF can embed — and the app stores — always redrawn through a canvas at up to
 * 2× the size it's shown at. Passing the upload straight through went wrong
 * in too many ways: a JPEG saved as .png gets a PNG data URL and breaks
 * pdf-lib, an animated PNG is refused, a phone photo's EXIF rotation is
 * ignored, and a small file can still be an 8000-pixel image. The canvas
 * decodes whatever the browser can show, upright, at a sensible size. Photos
 * (JPEG by their first bytes) stay JPEG; everything else becomes a PNG, which
 * keeps transparency.
 */
export async function redrawLogo(dataUrl: string): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  const toBytes = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, 600 / (image.naturalWidth || 600), 200 / (image.naturalHeight || 200)) * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || 300) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || 100) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const head = dataUrl.startsWith("data:") && dataUrl.includes(";base64,") ? toBytes(dataUrl.slice(0, dataUrl.indexOf(",") + 8)) : null;
  const jpeg = head !== null && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  return jpeg
    ? { bytes: toBytes(canvas.toDataURL("image/jpeg", 0.92)), kind: "jpg" }
    : { bytes: toBytes(canvas.toDataURL("image/png")), kind: "png" };
}

