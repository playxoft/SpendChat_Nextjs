import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Global components applied to every MDX file (the blog lives in
 * `src/content/blog`). Required by `@next/mdx` with the App Router — see
 * `next.config.ts`. Styled by hand to match the marketing pages (neutral,
 * muted body text, foreground headings, a single accent on links) rather than
 * pulling in the `@tailwindcss/typography` `prose` plugin.
 */

const linkClass =
  "font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground";

const components = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1
      className="mt-12 scroll-mt-24 text-3xl font-semibold tracking-tight text-foreground"
      {...props}
    />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2
      className="mt-10 scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground"
      {...props}
    />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3
      className="mt-8 scroll-mt-24 text-xl font-semibold tracking-tight text-foreground"
      {...props}
    />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="mt-5 leading-relaxed text-muted-foreground" {...props} />
  ),
  a: ({ href = "", ...props }: ComponentPropsWithoutRef<"a">) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} className={linkClass} {...props} />
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className={linkClass} {...props} />
    ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="mt-5 list-disc space-y-2 pl-6 text-muted-foreground marker:text-muted-foreground/50"
      {...props}
    />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="mt-5 list-decimal space-y-2 pl-6 text-muted-foreground marker:text-muted-foreground/50"
      {...props}
    />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="leading-relaxed [&>ol]:mt-2 [&>ul]:mt-2" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="mt-6 border-l-2 border-border pl-4 text-muted-foreground italic"
      {...props}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-10 border-border" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em] text-foreground"
      {...props}
    />
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="mt-5 overflow-x-auto rounded-xl border bg-muted p-4 text-sm [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="mt-6 overflow-x-auto rounded-xl border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      className="border-b bg-muted px-4 py-2 text-left font-medium text-foreground"
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b px-4 py-2 text-muted-foreground" {...props} />
  ),
  img: ({ alt = "", ...props }: ComponentPropsWithoutRef<"img">) => (
    // Blog images have unknown intrinsic dimensions, so a plain <img> is simpler
    // than next/image here; posts are static and images are lazy-loaded.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="mt-6 rounded-xl border" loading="lazy" alt={alt} {...props} />
  ),
};

export function useMDXComponents(): typeof components {
  return components;
}
