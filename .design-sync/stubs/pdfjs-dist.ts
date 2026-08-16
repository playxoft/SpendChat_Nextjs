// Stand-in for `pdfjs-dist`, wired in by the `paths` map in
// tsconfig.sync.json / tsconfig.emit.json.
//
// `PendingMessagesProvider` → `attachments/upload-client` → `attachments/
// thumbnail` → `./pdf-thumbnail` → `pdfjs-dist`. In the app that last hop is a
// dynamic import, so pdf.js (~1 MB) only loads when someone uploads a PDF; in a
// single-IIFE design bundle there is no second chunk to defer it to, and it
// lands in the one file every preview card loads. Its worker is resolved with
// `new URL(..., import.meta.url)`, which an IIFE has no meaning for either.
//
// Nothing in a preview uploads a file, so the whole path is unreachable —
// stubbing it drops ~1 MB and the broken worker URL with it. Members are typed
// loosely on purpose: `pdf-thumbnail.ts` walks a deep pdf.js object graph
// (document → page → viewport → render task) and none of it is ever executed.

/* eslint-disable @typescript-eslint/no-explicit-any */
const stub = () =>
  new Error(
    "pdf.js is not bundled in the SpendChat design system — PDF thumbnails are generated in " +
      "the app, not in a preview. Wire your own handler when composing with this component.",
  );

// Assignable and inert — `ensureWorker()` writes to it before anything that
// can fail, and there is no worker to configure here.
export const GlobalWorkerOptions: any = { workerPort: null, workerSrc: "" };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getDocument(..._args: unknown[]): any {
  throw stub();
}
/* eslint-enable @typescript-eslint/no-explicit-any */
