import * as pdfjs from "pdfjs-dist";

/**
 * Renders page 1 of a PDF to a small square WebP thumbnail, in the browser. This
 * module is **dynamically imported** (see `thumbnail.ts`) so pdf.js (~1 MB) only
 * loads when a PDF is actually uploaded — it never enters the main bundle.
 *
 * The worker is an ESM module worker resolved through the bundler
 * (`new URL(..., import.meta.url)`), configured once. Everything is best-effort:
 * the caller wraps this in try/catch and falls back to the type icon.
 */

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerPort = new Worker(
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
    { type: "module" },
  );
  workerConfigured = true;
}

export async function pdfThumbnail(file: File, size: number): Promise<Blob | null> {
  ensureWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Scale the page so its width matches the thumbnail square.
    const viewport = page.getViewport({ scale: size / base.width });

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.max(1, Math.ceil(viewport.width));
    pageCanvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvas: pageCanvas, viewport }).promise;

    // Draw the top of the page onto a filled square (document-style preview).
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(pageCanvas, 0, 0, size, (pageCanvas.height * size) / pageCanvas.width);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", 0.72));
  } finally {
    void doc.cleanup();
    await loadingTask.destroy();
  }
}
