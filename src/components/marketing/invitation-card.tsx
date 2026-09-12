import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The dashed "ask us for something" card that ends a directory.
 *
 * `/blog` has two (follow the feed, suggest a topic) and `/compare` has one
 * (request a comparison), and they were three copies of the same hundred
 * characters of class list — the treatment the next tweak would have drifted
 * apart, in the same way the feature cards did. One component, three call
 * sites.
 *
 * The title is deliberately not a heading: these are calls to action, not
 * sections, and an `h2` beside the real cards would put them in the page
 * outline as though they were.
 *
 * `size` matches the card to the ones it sits with — `lg` for the roomy blog
 * cards, `sm` for the tighter comparison grid. They align differently on
 * purpose: a comparison card's affordance sits on the baseline its neighbours'
 * do, while a blog card shares a row with a post card tall enough to carry a
 * cover image, and centring is what keeps it from reading as a column of text
 * with a stranded link underneath.
 */
const SIZE = {
  sm: {
    align: "",
    padding: "p-5",
    title: "font-medium",
    body: "mt-1.5 flex-1 text-sm",
  },
  lg: {
    align: "justify-center",
    padding: "p-6",
    title: "text-xl font-semibold tracking-tight",
    body: "mt-2",
  },
} as const;

export function InvitationCard({
  icon: Icon,
  title,
  body,
  cta,
  href,
  external = false,
  event,
  params,
  size = "sm",
  className,
}: {
  /** Optional: the blog cards carry one, the comparison card doesn't. */
  icon?: LucideIcon;
  title: string;
  body: ReactNode;
  /** The affordance at the foot of the card, e.g. "Suggest a topic". */
  cta: string;
  href: string;
  /** Opens in a new tab, for links that leave the site. */
  external?: boolean;
  /** Analytics event name, e.g. `outbound_click`. */
  event: string;
  params: Record<string, string>;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const style = SIZE[size];

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      data-track-event={event}
      data-track-params={JSON.stringify(params)}
      className={cn(
        "group flex flex-col rounded-2xl border border-dashed bg-muted/20 transition-all hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-md",
        style.align,
        style.padding,
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 flex size-10 items-center justify-center rounded-xl border bg-background transition-colors group-hover:bg-muted">
          <Icon className="size-5" />
        </span>
      )}
      <p className={style.title}>{title}</p>
      <p className={cn("text-muted-foreground", style.body)}>{body}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
        {cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
