"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The animated body of the 404 page: a giant "404" whose middle zero is a
 * two-faced spinning coin, a short chat thread in the tracker's own bubble
 * style, and a "NOT FOUND" receipt that prints the path the visitor was after.
 *
 * Everything animates with CSS only (staggered `animate-rise` + a few keyframes
 * in globals.css), so there is no flash-of-hidden-content and the global
 * reduced-motion rule disables it all gracefully.
 */
export function NotFoundExperience() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="w-full max-w-xl">
      {/* 404 with a spinning coin for the 0 */}
      <div
        role="img"
        aria-label="404 — page not found"
        className="flex select-none items-center justify-center gap-1.5 sm:gap-3"
      >
        <span
          aria-hidden
          className="animate-rise text-[clamp(3.75rem,15vw,7rem)] font-semibold leading-none tracking-tighter tabular-nums text-foreground"
        >
          4
        </span>
        <Coin />
        <span
          aria-hidden
          className="animate-rise text-[clamp(3.75rem,15vw,7rem)] font-semibold leading-none tracking-tighter tabular-nums text-foreground"
          style={{ animationDelay: "120ms" }}
        >
          4
        </span>
      </div>

      {/* Headline */}
      <div
        className="animate-rise mt-4 text-center sm:mt-5"
        style={{ animationDelay: "160ms" }}
      >
        <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
          This page bounced.
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-pretty text-sm text-muted-foreground">
          We combed through every line of the ledger — that page just
          isn&rsquo;t on the books. Your balance is safe, promise.
        </p>
      </div>

      {/* Chat thread, in the tracker's own bubble style */}
      <div className="mx-auto mt-4 flex w-full max-w-md flex-col gap-2.5 sm:mt-5">
        <ChatRow side="right" avatar="🤔" delay={240}>
          <Bubble side="right">Hey, where&rsquo;s the page I asked for? 👀</Bubble>
        </ChatRow>

        <ChatRow side="left" avatar={<BubbleMark />} delay={420}>
          <Bubble side="left">
            Checked every line of your ledger — that page isn&rsquo;t on the
            books.
          </Bubble>
        </ChatRow>

        <ChatRow side="left" avatar="🧾" align="start" delay={600}>
          <Receipt path={pathname} />
        </ChatRow>
      </div>

      {/* Ways back */}
      <div
        className="animate-rise mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:mt-6"
        style={{ animationDelay: "320ms" }}
      >
        <Button
          variant="outline"
          size="lg"
          className="h-10 px-5"
          onClick={() => router.back()}
        >
          <ArrowLeft />
          Go back
        </Button>
        <Button asChild size="lg" className="h-10 px-5">
          <Link href="/">
            <Home />
            Back to home
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-10 px-5">
          <Link href="/app">
            <MessageSquare />
            Open the tracker
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ── The coin (the "0" in 404) ──────────────────────────────────────────────
   A flat two-faced disc — "$" on the front, the SpendChat bubble mark on the
   back — flipping in 3D. Neutral disc, single emerald accent, no gradients. */
function Coin() {
  return (
    <span
      aria-hidden
      className="animate-rise inline-block [perspective:700px]"
      style={{ animationDelay: "80ms" }}
    >
      <span className="relative block size-[clamp(3.25rem,13vw,6rem)] animate-coin-spin [transform-style:preserve-3d]">
        <CoinFace>
          <span className="text-[clamp(1.5rem,6vw,2.75rem)] font-bold text-emerald-600 dark:text-emerald-400">
            $
          </span>
        </CoinFace>
        <CoinFace className="[transform:rotateY(180deg)]">
          <BubbleMark className="size-1/2 text-foreground" />
        </CoinFace>
      </span>
    </span>
  );
}

function CoinFace({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "absolute inset-0 grid place-items-center rounded-full border-2 border-foreground/15 bg-muted shadow-sm [backface-visibility:hidden]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Chat scaffolding ───────────────────────────────────────────────────── */
function ChatRow({
  side,
  avatar,
  align = "end",
  delay,
  children,
}: {
  side: "left" | "right";
  avatar: ReactNode;
  align?: "start" | "end";
  delay: number;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "animate-rise flex max-w-[88%] gap-2.5",
        align === "end" ? "items-end" : "items-start",
        side === "right" && "ml-auto flex-row-reverse",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
      >
        {avatar}
      </span>
      {children}
    </div>
  );
}

function Bubble({
  side,
  children,
}: {
  side: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card px-3.5 py-2.5 text-sm shadow-sm",
        side === "left" ? "rounded-tl-sm" : "rounded-tr-sm",
      )}
    >
      {children}
    </div>
  );
}

/* ── The receipt — torn top & bottom edges, dotted leaders, NOT FOUND stamp ── */
const RECEIPT_TEETH = 22;
const RECEIPT_WIDTH = 240;
const RECEIPT_TOOTH_H = 6;
const RECEIPT_ZIGZAG = Array.from({ length: RECEIPT_TEETH }, (_, i) => {
  const step = RECEIPT_WIDTH / RECEIPT_TEETH;
  const x = i * step;
  return `M${x} 0L${x + step / 2} ${RECEIPT_TOOTH_H}L${x + step} 0Z`;
}).join("");

function Receipt({ path }: { path: string }) {
  return (
    <div className="relative w-full max-w-[13rem] bg-muted font-mono text-sm leading-relaxed text-foreground shadow-sm">
      {/* torn top edge (background-colored teeth notch into the card) */}
      <svg
        aria-hidden
        viewBox={`0 0 ${RECEIPT_WIDTH} ${RECEIPT_TOOTH_H}`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-1.5 w-full"
      >
        <path d={RECEIPT_ZIGZAG} fill="var(--background)" />
      </svg>

      <div className="space-y-1 px-3.5 py-3">
        <p className="text-center text-[9px] font-semibold tracking-[0.25em] text-foreground">
          SPENDCHAT
        </p>

        <div className="my-1 border-t border-dashed border-border" />

        <ReceiptRow k="ITEM" v="Page not found" />
        <ReceiptRow k="REF" v={path || "/"} />
        <ReceiptRow k="AMOUNT" v="$0.00" />

        <div className="my-1 border-t border-dashed border-border" />

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">STATUS</span>
          <span
            className="animate-stamp inline-block rounded border-2 border-destructive px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-destructive"
            style={{ animationDelay: "0.7s" }}
          >
            NOT FOUND
          </span>
        </div>
      </div>

      {/* torn bottom edge (same teeth, flipped) */}
      <svg
        aria-hidden
        viewBox={`0 0 ${RECEIPT_WIDTH} ${RECEIPT_TOOTH_H}`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-1.5 w-full rotate-180"
      >
        <path d={RECEIPT_ZIGZAG} fill="var(--background)" />
      </svg>
    </div>
  );
}

function ReceiptRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 flex-1 translate-y-[-3px] border-b border-dotted border-border" />
      <span className="max-w-[58%] shrink-0 truncate text-foreground">{v}</span>
    </div>
  );
}

/* SpendChat's chat-bubble mark (mirrors components/logo.tsx). */
function BubbleMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn("size-[18px]", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <text
        x="12"
        y="10.4"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="9"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        $
      </text>
    </svg>
  );
}

