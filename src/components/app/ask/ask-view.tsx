"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Check,
  Copy,
  Loader2,
  Lock,
  MessagesSquare,
  Sparkles,
  SquarePen,
} from "lucide-react";
import { askAi } from "@/actions/ai-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { aiActionsLock } from "@/lib/add-limits";
import { ASK_NEEDS_EDIT_MESSAGE, type AiActionsLeft } from "@/lib/ai-limits";
import { planLimitOf } from "@/lib/plan-limit";
import { AI_CHAT_QUESTION_MAX } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO, ChatSummary } from "@/services/ai-chat";
import { AI_BTN } from "../ai-accent";
import { AiActionsLeftLine } from "../ai-actions-left";
import { LimitPanel, LockedButton } from "../limit-lock";
import { usePermissions } from "../permissions";
import { usePlan } from "../upgrade-dialog";
import { AnswerMarkdown } from "./answer-markdown";
import { askHref } from "./ask-paths";
import { ChatList } from "./chat-list";

/** Questions that show what Ask is for — tapping one fills the box, it doesn't send. */
const SUGGESTIONS = [
  "How much did I spend on food last month?",
  "Top 5 expenses this month",
  "Compare this month to last month",
];

/**
 * Ask's conversation: the messages as chat bubbles, and a composer docked at
 * the bottom like the tracker's AI mode — the blue→violet gradient on its send
 * button only, since that's the button that calls a model.
 *
 * The conversation lives in client state while the page is open. A first
 * answer gives the chat its id, and the URL moves to it (`?c=…`) — the page is
 * keyed by chat, so that remount re-reads the stored messages from the server.
 * Later answers only refresh the server parts (the chat list's order).
 *
 * Answers render as Markdown through `AnswerMarkdown` (no HTML, no images, safe
 * links only); questions render as plain text.
 */
export function AskView({
  chatId,
  title,
  initialMessages,
  chats,
  configured,
  allowance,
  workspaceName,
}: {
  chatId: string | null;
  title: string | null;
  initialMessages: ChatMessageDTO[];
  chats: ChatSummary[];
  /** Whether this server has an Ask model (`AI_CHAT_MODEL`); without one, nothing can be asked. */
  configured: boolean;
  allowance: AiActionsLeft | null;
  workspaceName: string;
}) {
  const router = useRouter();
  const profile = useSearchParams().get("profile");
  const { plan, reportFailure } = usePlan();
  // Ask spends the workspace's shared AI actions, so it takes edit access,
  // like the composer's AI mode. A viewer reads their chats but gets a note
  // where the composer would be — never a button that can only fail.
  const { canWrite } = usePermissions();
  const [messages, setMessages] = useState(initialMessages);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [aiLeft, setAiLeft] = useState<AiActionsLeft | null>(null);
  const [asking, startAsking] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const left = aiLeft ?? allowance;
  const spent = left !== null && left.remaining <= 0;
  const lock = spent ? aiActionsLock(plan, left.limit) : null;
  const busy = asking || pendingQuestion !== null;

  // Open at the newest message, then follow each new one.
  const count = messages.length + (pendingQuestion ? 1 : 0);
  const first = useRef(true);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: first.current ? "instant" : "smooth" });
    first.current = false;
  }, [count]);

  function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy || spent || !configured || !canWrite) return;
    setPendingQuestion(question);
    setText("");
    startAsking(async () => {
      const res = await askAi({ chatId: chatId ?? undefined, question });
      setPendingQuestion(null);
      if (!res.ok) {
        const limit = planLimitOf(res);
        if (limit?.limit === "aiActions" && limit.max !== undefined) {
          setAiLeft({ remaining: Math.max(0, limit.max - (limit.used ?? limit.max)), limit: limit.max });
        }
        reportFailure(res, "Couldn't get an answer — try again.");
        // Give the question back so it can be sent again as it was.
        setText((current) => current || question);
        return;
      }
      setAiLeft(res.ai);
      setMessages((m) => [...m, ...res.messages]);
      if (res.chat.id !== chatId) {
        // A new chat (or one deleted elsewhere and brought back): move to its
        // address. The page remounts on it and reads the messages back.
        router.replace(askHref({ chatId: res.chat.id, profile }), { scroll: false });
      } else {
        // Same chat: it moved to the top of the list.
        router.refresh();
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.altKey) return;
    // Mid-composition Enter commits the IME candidate; it isn't "send".
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    ask(text);
  }

  function suggest(q: string) {
    setText(q);
    requestAnimationFrame(() => {
      const node = taRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(q.length, q.length);
    });
  }

  const empty = messages.length === 0 && !pendingQuestion;

  return (
    <div className="flex min-h-[calc(100svh-7.5rem)] flex-col md:min-h-[calc(100svh-3.5rem)]">
      <AskHeader title={title} chats={chats} profile={profile} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {!configured ? (
          <NotSetUp />
        ) : empty ? (
          <EmptyState workspaceName={workspaceName} onPick={canWrite ? suggest : null} />
        ) : null}

        {!empty && (
          <ol className="space-y-5" aria-label="Messages">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} text={m.content} />
              ) : (
                <AnswerBubble key={m.id} text={m.content} />
              ),
            )}
            {pendingQuestion && (
              <>
                <UserBubble text={pendingQuestion} />
                <Thinking />
              </>
            )}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      {configured && !canWrite && (
        <div className="sticky bottom-16 z-20 bg-background px-3 pt-2 pb-2 md:bottom-0 print:hidden">
          <p
            role="note"
            className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            <Lock aria-hidden className="size-4 shrink-0" />
            {ASK_NEEDS_EDIT_MESSAGE}
          </p>
        </div>
      )}

      {configured && canWrite && (
        <div className="sticky bottom-16 z-20 bg-background px-3 pt-2 pb-2 md:bottom-0 print:hidden">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border bg-background p-2.5 shadow-lg md:bg-background/95 md:backdrop-blur-sm">
            {lock && <LimitPanel lock={lock} hint="Ask is back when your actions refill on the 1st." />}
            <div className="relative">
              <Textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={AI_CHAT_QUESTION_MAX}
                disabled={spent}
                placeholder="Ask about your money — e.g. How much did I spend on food last month?"
                aria-label="Your question"
                className="max-h-48 min-h-[3.25rem] resize-none pr-12 md:text-base"
              />
              <div className="absolute right-1.5 bottom-1.5">
                <LockedButton
                  lock={lock}
                  type="button"
                  size="icon-lg"
                  onClick={() => ask(text)}
                  disabled={busy || !text.trim()}
                  aria-label="Ask"
                  title="Ask (Enter)"
                  className={cn("rounded-full p-0", !lock && AI_BTN)}
                >
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
                </LockedButton>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-0.5">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                Answers come from your transactions. Each question uses 1 AI action.
              </p>
              <AiActionsLeftLine allowance={null} latest={left} className="shrink-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The page's title row. Below `lg` it also carries the chat list (a sheet) and "New chat". */
function AskHeader({
  title,
  chats,
  profile,
}: {
  title: string | null;
  chats: ChatSummary[];
  profile: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm print:hidden">
      <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Your chats" className="lg:hidden">
              <MessagesSquare className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle>Chats</SheetTitle>
              <SheetDescription className="sr-only">Your Ask chats in this workspace.</SheetDescription>
            </SheetHeader>
            <ChatList chats={chats} onNavigate={() => setOpen(false)} className="min-h-0 flex-1" />
          </SheetContent>
        </Sheet>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title ?? "Ask"}</h1>
        <Button asChild variant="ghost" size="icon-sm" className="lg:hidden">
          <Link href={askHref({ profile })} aria-label="New chat" title="New chat">
            <SquarePen className="size-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <li className="flex justify-end">
      {/* Plain text, never Markdown: it's what the person typed. */}
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm border bg-card px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm">
        {text}
      </div>
    </li>
  );
}

function AnswerBubble({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* The clipboard can be blocked; the text is still on screen to select. */
    }
  }
  return (
    <li className="flex items-start gap-2.5">
      <AskAvatar />
      <div className="min-w-0 max-w-[calc(100%-2.5rem)] flex-1 sm:flex-none">
        <div className="rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 shadow-sm">
          <AnswerMarkdown>{text}</AnswerMarkdown>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={copy}
          className="mt-1 text-muted-foreground"
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </li>
  );
}

function AskAvatar() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground"
    >
      <Sparkles className="size-3.5" />
    </span>
  );
}

function Thinking() {
  return (
    <li className="flex items-start gap-2.5" aria-live="polite">
      <AskAvatar />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="size-4 animate-spin" />
        Reading your transactions…
      </div>
    </li>
  );
}

function EmptyState({
  workspaceName,
  onPick,
}: {
  workspaceName: string;
  /** Fills the composer — null when there's no composer (a viewer), so no chips. */
  onPick: ((q: string) => void) | null;
}) {
  return (
    <div className="flex flex-col items-center px-2 pt-10 text-center sm:pt-16">
      <span className="flex size-11 items-center justify-center rounded-full border bg-muted text-muted-foreground">
        <Sparkles className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">Ask about your money</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Answers come from the transactions you can see in {workspaceName} — totals, top expenses,
        month-on-month changes.
      </p>
      {onPick && (
        <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((q) => (
            <Button
              key={q}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPick(q)}
              className="h-auto rounded-full px-3 py-1.5 text-left whitespace-normal"
            >
              {q}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotSetUp() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border bg-muted/30 p-5 text-center sm:mt-16">
      <span className="mx-auto flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Sparkles className="size-5" />
      </span>
      <h2 className="mt-3 text-base font-semibold">Ask isn&apos;t set up on this server</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Its AI model hasn&apos;t been configured, so questions can&apos;t be answered here yet.
        Everything else in SpendChat works as usual.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Running this server? Set <code className="font-mono">AI_CHAT_MODEL</code> and{" "}
        <code className="font-mono">AI_CHAT_MODEL_CURRENT</code>.
      </p>
    </div>
  );
}
