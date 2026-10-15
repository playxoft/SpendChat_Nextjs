import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { PdfFonts } from "@/lib/business-doc/invoice-pdf";

/**
 * The PDF font files (Noto Sans, `public/fonts/pdf/`), read on the server for
 * invoices drawn there — the same files the free generator fetches in the
 * browser, so both PDFs look alike.
 *
 * On a Worker they come through the static-assets binding (`ASSETS`, which
 * serves `public/` and only looks at the path); everywhere else (`next dev`,
 * tests) straight off the disk. Kept for the isolate's life once read — a
 * failed read is forgotten, so the next request tries again.
 */

const FILES = { regular: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf" } as const;

let cached: Promise<PdfFonts> | null = null;

export function loadPdfFonts(): Promise<PdfFonts> {
  cached ??= Promise.all([readFont(FILES.regular), readFont(FILES.bold)])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((err: unknown) => {
      cached = null;
      throw err;
    });
  return cached;
}

async function readFont(name: string): Promise<Uint8Array> {
  let assets: { fetch(request: Request): Promise<Response> } | undefined;
  try {
    assets = (getCloudflareContext().env as { ASSETS?: typeof assets }).ASSETS;
  } catch {
    // Not inside a Worker request (tests, scripts).
  }
  if (assets) {
    const res = await assets.fetch(new Request(`https://assets.local/fonts/pdf/${name}`));
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  }
  const [{ readFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  return new Uint8Array(await readFile(path.join(process.cwd(), "public", "fonts", "pdf", name)));
}
