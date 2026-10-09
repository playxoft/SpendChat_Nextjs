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

/** The answer and count an `ai_chat_not_saved` failure carries, if well-formed. */
function unsavedAnswerOf(details: unknown): { answer: string; ai: AiActionsLeft } | null {
  if (!details || typeof details !== "object") return null;
  const d = details as { answer?: unknown; ai?: { remaining?: unknown; limit?: unknown } };
  if (typeof d.answer !== "string" || !d.ai) return null;
  const { remaining, limit } = d.ai;
  if (typeof remaining !== "number" || typeof limit !== "number") return null;
  return { answer: d.answer, ai: { remaining, limit } };
}

/** Questions that show what SpendChat AI is for — tapping one fills the box, it doesn't send. */
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
 * answer gives the chat its id: the URL takes it in place (`?c=…`, through
 * `history.replaceState`) and the view stays mounted, so a follow-up being
 * typed meanwhile survives; `router.refresh()` then brings the chat list up to
 * date. Opening another chat or "New chat" changes the `chatId` prop, and the
 * view starts over from what the server read for it.
 *
 * Answers render as Markdown through `AnswerMarkdown` (no HTML, no images, safe
 * links only); questions render as plain text.
 *
 * The page is the same whether or not the server has a model: without one, a
 * question gets a sample answer in dev and beta (captioned, quietly) and a
 * plain inline error in production — never a "not set up" banner.
 */
export function AskView({
  chatId,
  title,
  initialMessages,
  chats,
  sampleAnswers,
  allowance,
  workspaceName,
}: {
  chatId: string | null;
  title: string | null;
  initialMessages: ChatMessageDTO[];
  chats: ChatSummary[];
  /**
   * No model, in dev, tests or beta: answers are samples (`buildSampleAnswer`)
   * that cost nothing, so a spent allowance doesn't lock the composer.
   */
  sampleAnswers: boolean;
  allowance: AiActionsLeft | null;
  workspaceName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = searchParams.get("profile");
  // The chat in the address bar. Read from the URL rather than the `chatId`
  // prop because it moves the moment `replaceState` does, before the server
  // catches up — so "New chat" clicked right after a first answer is seen.
  const urlChatId = searchParams.get("c");
  const { plan, reportFailure } = usePlan();
  // Ask spends the workspace's shared AI actions, so it takes edit access,
  // like the composer's AI mode. A viewer reads their chats but gets a note
  // where the composer would be — never a button that can only fail.
  const { canWrite } = usePermissions();
  // The chat on screen: the page's, until a first answer creates one.
  const [currentChatId, setCurrentChatId] = useState(chatId);
  // The URL's chat as last seen, to tell a navigation from the URL catching
  // up with a chat this view created itself.
  const [shownUrlChatId, setShownUrlChatId] = useState(urlChatId);
  const [messages, setMessages] = useState(initialMessages);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  // The last question that got no answer, shown in the thread with its error.
  const [failed, setFailed] = useState<{ question: string; error: string } | null>(null);
  const [text, setText] = useState("");
  const [aiLeft, setAiLeft] = useState<AiActionsLeft | null>(null);
  const [asking, startAsking] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  if (urlChatId !== shownUrlChatId) {
    setShownUrlChatId(urlChatId);
    // Another chat was opened (the list, "New chat"): start from what the
    // server read for it. The URL taking the id of the chat this view just
    // created is no navigation — that chat is already on screen, and so is
    // anything typed since.
    if (urlChatId !== currentChatId) {
      setCurrentChatId(urlChatId);
      setMessages(urlChatId === chatId ? initialMessages : []);
      setPendingQuestion(null);
      setFailed(null);
      setText("");
    }
  }

  // What an answer that arrives late checks before touching anything: is this
  // view still mounted, and still on the chat the question was asked in?
  const mounted = useRef(false);
  const currentChatRef = useRef(currentChatId);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    currentChatRef.current = currentChatId;
  }, [currentChatId]);

  const left = aiLeft ?? allowance;
  const spent = !sampleAnswers && left !== null && left.remaining <= 0;
  const lock = spent ? aiActionsLock(plan, left.limit) : null;
  const busy = asking || pendingQuestion !== null;

  // Open at the newest message, then follow each new one. The window's own
  // bottom, not the last bubble's: the composer (sticky) and, on a phone, the
  // bottom nav sit over the last stretch of the viewport, and the page's end
  // is laid out below both — so this is the one target nothing covers.
  // Jump (no animation) on opening a chat; glide for a new message.
  const count = messages.length + (pendingQuestion ? 1 : 0) + (failed ? 1 : 0);
  const lastScroll = useRef<{ chat: string | null | undefined; count: number }>({
    chat: undefined,
    count: 0,
  });
  useEffect(() => {
    const prev = lastScroll.current;
    lastScroll.current = { chat: shownUrlChatId, count };
    if (count === 0) return;
    const opened = prev.chat !== shownUrlChatId || count - prev.count > 2;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: opened ? "instant" : "smooth",
    });
  }, [count, shownUrlChatId]);

  function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy || spent || !canWrite) return;
    const askedIn = currentChatId;
    setFailed(null);
    setPendingQuestion(question);
    setText("");
    startAsking(async () => {
      const res = await askAi({ chatId: askedIn ?? undefined, question });
      // Left Ask, or opened another chat, while this was being answered: the
      // answer is stored in its own chat; nothing here is about it any more —
      // and above all, no navigation back to it.
      if (!mounted.current || currentChatRef.current !== askedIn) return;
      setPendingQuestion(null);
      if (!res.ok && res.code === "ai_chat_not_saved") {
        // Paid for and answered, just not stored: show it (it won't be there
        // after a reload) and count the action it cost.
        const unsaved = unsavedAnswerOf(res.details);
        if (unsaved) {
          setAiLeft(unsaved.ai);
          const at = new Date().toISOString();
          setMessages((m) => [
            ...m,
            { id: `unsaved-q-${at}`, role: "user", content: question, createdAt: at, sample: false },
            {
              id: `unsaved-a-${at}`,
              role: "assistant",
              content: unsaved.answer,
              createdAt: at,
              sample: false,
            },
          ]);
        }
        reportFailure(res);
        return;
      }
      if (!res.ok) {
        const limit = planLimitOf(res);
        if (limit) {
          // A plan limit opens the upgrade dialog, as everywhere; the question
          // goes back in the box for after.
          if (limit.limit === "aiActions" && limit.max !== undefined) {
            setAiLeft({ remaining: Math.max(0, limit.max - (limit.used ?? limit.max)), limit: limit.max });
          }
          reportFailure(res);
          setText((current) => current || question);
          return;
        }
        // Anything else stays with the question it belongs to, in the thread,
        // with a way to send it again — no toast, no banner.
        setFailed({ question, error: res.error || "Couldn't answer right now." });
        return;
      }
      if (res.ai) setAiLeft(res.ai);
      setMessages((m) => [...m, ...res.messages]);
      if (res.chat.id !== askedIn) {
        // A new chat (or one deleted elsewhere and brought back): the URL takes
        // its id in place — Next's router follows `replaceState` — and the view
        // stays mounted, keeping a follow-up already being typed.
        setCurrentChatId(res.chat.id);
        currentChatRef.current = res.chat.id;
        window.history.replaceState(null, "", askHref({ chatId: res.chat.id, profile }));
      }
      // The chat list: a new row, or this one moved to the top.
      router.refresh();
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

  const empty = messages.length === 0 && !pendingQuestion && !failed;

  return (
    <div className="flex min-h-[calc(100svh-7.5rem)] flex-col md:min-h-[calc(100svh-3.5rem)]">
      <AskHeader title={title} chats={chats} profile={profile} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {empty && <EmptyState workspaceName={workspaceName} onPick={canWrite ? suggest : null} />}

        {!empty && (
          <ol className="space-y-5" aria-label="Messages">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} text={m.content} />
              ) : (
                <AnswerBubble key={m.id} text={m.content} sample={m.sample} />
              ),
            )}
            {failed && !pendingQuestion && (
              <>
                <UserBubble text={failed.question} />
                <li className="flex justify-end">
                  <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
                    {failed.error}
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => ask(failed.question)}
                        disabled={busy}
                        className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        Try again
                      </button>
                    )}
                  </p>
                </li>
              </>
            )}
            {pendingQuestion && (
              <>
                <UserBubble text={pendingQuestion} />
                <Thinking />
              </>
            )}
          </ol>
        )}
      </div>

      {!canWrite && (
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

      {canWrite && (
        <div className="sticky bottom-16 z-20 bg-background px-3 pt-2 pb-2 md:bottom-0 print:hidden">
          <div className="mx-auto max-w-3xl">
            {lock && (
              <LimitPanel
                lock={lock}
                hint="SpendChat AI is back when your actions refill on the 1st."
                className="mb-2"
              />
            )}
            {/* A slim message bar: one line that grows with what's typed (up
                to ~6 lines, then scrolls). The send button is the line's
                height and sits at the bar's bottom — level with the text on
                one line, pinned under the last line once it grows. */}
            <div
              className={cn(
                "flex items-end gap-2 rounded-3xl border bg-background py-1.5 pr-1.5 pl-4 shadow-lg transition-[border-color,box-shadow]",
                "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                "md:bg-background/95 md:backdrop-blur-sm",
                // Out of actions: one dimmed bar. The field and the button
                // inside opt out of their own disabled fade, which stacked on
                // this one left the text at ~30% and hard to read.
                spent && "opacity-60",
              )}
            >
              <Textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={AI_CHAT_QUESTION_MAX}
                disabled={spent}
                placeholder="Ask about your money…"
                aria-label="Your question"
                className={cn(
                  // The base field's chrome moves to the bar around it.
                  "max-h-40 min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-1 text-base leading-6 shadow-none md:text-base",
                  "focus-visible:border-0 focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:disabled:bg-transparent",
                  // Content sizing measures the placeholder too: keep it to one line.
                  "placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap",
                )}
              />
              <LockedButton
                lock={lock}
                type="button"
                size="icon"
                onClick={() => ask(text)}
                disabled={busy || !text.trim()}
                aria-label="Send"
                title="Send (Enter)"
                className={cn(
                  "size-8 shrink-0 rounded-full p-0",
                  !lock && AI_BTN,
                  // Only when out of actions — an empty box still fades it as usual.
                  spent && "disabled:opacity-100",
                )}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </LockedButton>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 pt-1">
              <p className="hidden min-w-0 truncate text-[11px] text-muted-foreground sm:block">
                Answers come from your transactions.
                {!sampleAnswers && " Each question uses 1 AI action."}
              </p>
              <AiActionsLeftLine
                allowance={null}
                latest={left}
                className="ml-auto shrink-0 text-[11px]"
              />
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
      {/* Three columns, the outer two the same width whether or not their
          buttons show (they're phone-only), so the title is centred on every
          screen. */}
      <div className="mx-auto grid h-12 max-w-3xl grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2 px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Your chats" className="lg:hidden">
              <MessagesSquare className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle>Chats</SheetTitle>
              <SheetDescription className="sr-only">
                Your SpendChat AI chats in this workspace.
              </SheetDescription>
            </SheetHeader>
            <ChatList chats={chats} onNavigate={() => setOpen(false)} className="min-h-0 flex-1" />
          </SheetContent>
        </Sheet>
        {/* One heading: the open chat's title, or the product's name on a new
            chat. Long titles end in an ellipsis; the full one is the tooltip. */}
        <h1
          title={title ?? undefined}
          className="col-start-2 min-w-0 truncate text-center text-sm font-semibold"
        >
          {title ?? "SpendChat AI"}
        </h1>
        <Button asChild variant="ghost" size="icon-sm" className="col-start-3 justify-self-end lg:hidden">
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

function AnswerBubble({ text, sample }: { text: string; sample: boolean }) {
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
        {/* Honest, not loud: built from your data without a model. */}
        {sample && <span className="ml-1 text-xs text-muted-foreground">Sample answer</span>}
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
      <h2 className="mt-4 text-lg font-semibold tracking-tight">Ask SpendChat AI about your money</h2>
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
