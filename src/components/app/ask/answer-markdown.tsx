import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ANSWER_LINK_REL, safeLinkUrl } from "@/lib/markdown-safety";
import { cn } from "@/lib/utils";

/**
 * An Ask answer, rendered as Markdown: headings, lists, tables, links, bold
 * and code, styled like the rest of the app. The text is model output — and
 * the model read the user's notes — so it's treated as untrusted:
 *
 * - **No raw HTML.** `skipHtml` drops it before rendering; nothing in an
 *   answer can become a tag, a script or an event handler.
 * - **No images.** They'd load on sight, and an image URL can carry data out
 *   without a click. Dropped along with their alt text.
 * - **Safe links only** (`safeLinkUrl`: absolute http, https, mailto), opening
 *   in a new tab with `rel="noopener noreferrer nofollow"`. Anything else
 *   keeps its text and loses the link.
 *
 * Headings shift down two levels (`#` → h3), so an answer can't add a second
 * h1 to the page or outrank the chat's own title. Tables scroll sideways inside
 * their own box rather than widening the page on a phone.
 *
 * No hooks and no state: it renders the same on the server and in the browser.
 */
export function AnswerMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("min-w-0 text-sm leading-relaxed break-words", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        urlTransform={(url) => safeLinkUrl(url) ?? ""}
        components={COMPONENTS}
      >
        {children}
      </Markdown>
    </div>
  );
}

const heading = "mt-4 mb-1.5 font-semibold tracking-tight text-foreground first:mt-0";

/**
 * Element props without react-markdown's `node` (the hast node, which would
 * otherwise land on the DOM element as an attribute), with our classes merged
 * in front of any the Markdown brought (remark-gfm's `contains-task-list`, a
 * fenced block's `language-…`).
 */
function props<P extends { node?: unknown; className?: string }>(
  { node, className, ...rest }: P,
  ours: string,
) {
  void node;
  return { ...rest, className: cn(ours, className) };
}

const COMPONENTS: Components = {
  h1: (p) => <h3 {...props(p, cn(heading, "text-base"))} />,
  h2: (p) => <h4 {...props(p, cn(heading, "text-base"))} />,
  h3: (p) => <h5 {...props(p, cn(heading, "text-sm"))} />,
  h4: (p) => <h6 {...props(p, cn(heading, "text-sm"))} />,
  h5: (p) => <h6 {...props(p, cn(heading, "text-sm"))} />,
  h6: (p) => <h6 {...props(p, cn(heading, "text-sm"))} />,
  p: (p) => <p {...props(p, "my-2 first:mt-0 last:mb-0")} />,
  ul: (p) => (
    <ul {...props(p, "my-2 ml-5 list-disc space-y-1 marker:text-muted-foreground first:mt-0 last:mb-0")} />
  ),
  ol: (p) => (
    <ol {...props(p, "my-2 ml-5 list-decimal space-y-1 marker:text-muted-foreground first:mt-0 last:mb-0")} />
  ),
  li: (p) => <li {...props(p, "pl-0.5")} />,
  strong: (p) => <strong {...props(p, "font-semibold text-foreground")} />,
  a: ({ href, children, ...p }) => {
    const safe = safeLinkUrl(href);
    if (!safe) return <span>{children}</span>;
    return (
      <a
        {...props(p, "font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground")}
        href={safe}
        target="_blank"
        rel={ANSWER_LINK_REL}
      >
        {children}
      </a>
    );
  },
  blockquote: (p) => <blockquote {...props(p, "my-2 border-l-2 pl-3 text-muted-foreground")} />,
  hr: () => <hr className="my-3 border-border" />,
  code: (p) => <code {...props(p, "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]")} />,
  pre: (p) => (
    <pre
      {...props(
        p,
        "my-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs [&>code]:bg-transparent [&>code]:p-0",
      )}
    />
  ),
  table: (p) => (
    // The box scrolls, not the page: a five-column comparison on a 360px phone.
    <div className="scrollbar-slim my-3 max-w-full overflow-x-auto rounded-lg border first:mt-0 last:mb-0">
      <table {...props(p, "w-full border-collapse text-sm tabular-nums")} />
    </div>
  ),
  thead: (p) => <thead {...props(p, "bg-muted/50")} />,
  tr: (p) => <tr {...props(p, "border-b last:border-b-0")} />,
  th: (p) => <th {...props(p, "px-3 py-1.5 text-left font-medium whitespace-nowrap")} />,
  td: (p) => <td {...props(p, "px-3 py-1.5 align-top whitespace-nowrap")} />,
};
