/**
 * An illustration inside a blog post.
 *
 * Posts use this rather than markdown's `![alt](src)` for three reasons, all of
 * which cost traffic or usability when they're missing:
 *
 * 1. **Alt text is a required prop.** Markdown lets you write `![](x.png)` and
 *    ship a decorative-looking image that a screen reader announces as nothing
 *    and Google reads as nothing. Here the type checker asks for it.
 * 2. **Intrinsic dimensions are declared**, so the article reserves the space
 *    before the bytes land. In-post figures sit below the fold and load lazily;
 *    without a reserved box each one shoves the paragraph you're reading down
 *    the page as it arrives.
 * 3. **A visible caption.** `<figure>`/`<figcaption>` is the markup that ties a
 *    picture to its explanation, and the caption is read by people who skim
 *    before they read — which, on a 1,500-word post, is most of them.
 *
 * Figures are static PNGs in `public/blog/`, rendered from
 * `scripts/blog-figure.html` at 1200×675 — the same headless-Chrome approach
 * as the covers, and for the same reason: they're served straight off
 * Cloudflare's CDN rather than through `next/image`'s optimizer, which on
 * OpenNext is a Worker invocation per image.
 */
export function Figure({
  src,
  alt,
  caption,
  width = 1200,
  height = 675,
}: {
  /** Root-relative path, e.g. "/blog/how-to-track-expenses-with-ai-flow.png". */
  src: string;
  /**
   * What the image shows, for a reader who can't see it. Describe the content,
   * not the file — "Three steps: a typed sentence, three editable drafts, a
   * confirm button" beats "diagram".
   */
  alt: string;
  /** Shown under the image. Should add something the surrounding prose doesn't. */
  caption: string;
  width?: number;
  height?: number;
}) {
  return (
    <figure className="mt-8">
      {/* Plain <img>: a static file in `public/`, so next/image would only add
          a hop. `loading="lazy"` is right here — every figure is below the
          fold, since the post's cover is the image above it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-xl border"
      />
      <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
