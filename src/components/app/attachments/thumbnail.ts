import { resolveAttachmentType } from "@/lib/validation";

/**
 * Client-side thumbnail generation. Each upload produces a tiny square WebP
 * preview in the browser (never on the Worker), stored in R2 next to the
 * original and shown in the small file squares. Best-effort: any file we can't
 * render returns null and the UI falls back to the type icon.
 *
 * Covered here: images (down-scaled, centre-cropped) and CSV/plain text (first
 * lines drawn as a document-like preview). PDF page 1 is rendered by
 * `./pdf-thumbnail`, dynamically imported so pdf.js stays out of the main bundle.
 */

/** Square edge, in px. Small — it's only ever shown at ~28–40px. */
const THUMB = 160;

function squareCanvas(): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB;
  canvas.height = THUMB;
  return canvas;
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", 0.72));
}

/** Best-effort small square WebP thumbnail for a file, or null (UI shows the icon). */
export async function generateThumbnail(file: File): Promise<Blob | null> {
  const type = resolveAttachmentType(file.name, file.type)?.contentType ?? file.type;
  try {
    if (type.startsWith("image/")) return await imageThumbnail(file);
    if (type === "text/csv" || type === "text/plain") return await textThumbnail(file);
    if (type === "application/pdf") {
      // Lazy — pdf.js only loads when a PDF is uploaded.
      const { pdfThumbnail } = await import("./pdf-thumbnail");
      return await pdfThumbnail(file, THUMB);
    }
  } catch {
    // best-effort — fall through to the icon
  }
  return null;
}

/** Down-scale + centre-crop an image to a filled square. */
async function imageThumbnail(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = squareCanvas();
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, THUMB, THUMB);
  // Cover: scale so the shorter side fills the square, then centre.
  const scale = Math.max(THUMB / bitmap.width, THUMB / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (THUMB - w) / 2, (THUMB - h) / 2, w, h);
  bitmap.close?.();
  return toWebp(canvas);
}

/** Draw the first lines of a text/CSV file as a tiny document preview. */
async function textThumbnail(file: File): Promise<Blob | null> {
  const text = await file.text();
  const lines = text.split(/\r?\n/, 14);
  const canvas = squareCanvas();
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, THUMB, THUMB);
  ctx.fillStyle = "#334155";
  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "top";
  const pad = 8;
  const lineHeight = 11;
  lines.forEach((line, i) => {
    ctx.fillText(line.slice(0, 42), pad, pad + i * lineHeight, THUMB - pad * 2);
  });
  return toWebp(canvas);
}
