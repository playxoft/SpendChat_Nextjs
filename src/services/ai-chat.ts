import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiChatMessages, aiChats, type AiChat } from "@/db/schema";
import {
  askChatModel,
  buildSampleAnswer,
  chatAnswerMode,
  chatTitleFrom,
  CHAT_UNAVAILABLE_MESSAGE,
  cleanAnswer,
  CHAT_HISTORY_MESSAGES,
  CHAT_MONTHS,
  CHAT_RECENT_TRANSACTIONS,
  CHAT_TOP_EXPENSES,
  CHAT_UPCOMING,
  nextDay,
  resolveChatModel,
  sameDayLastMonth,
  type ChatData,
  type ChatTxn,
} from "@/lib/ai-chat";
import { ASK_NEEDS_EDIT_MESSAGE, type AiActionsLeft } from "@/lib/ai-limits";
import { chargeAiChat, withAiCharge, type AiCharge } from "@/lib/ai-quota";
import { parseOrThrow } from "@/lib/api-response";
import { monthRange, monthStartBack } from "@/lib/dates";
import { getAiAllowance } from "@/lib/entitlements";
import { ApiError, forbidden, notFound } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import { siteConfig } from "@/lib/site";
import {
  getCategoryBreakdown,
  getMonthlyTotals,
  getSummary,
  listTransactions,
  type CategoryBreakdownRow,
  type TransactionRow,
} from "@/lib/queries";
import { askAiSchema, renameAiChatSchema } from "@/lib/validation";
import { canWriteInWorkspace, type WorkspaceSummary } from "@/lib/workspaces";

/**
 * Ask's chats: who may see them, and the one write that costs an AI action.
 *
 * **A chat is private to the person who started it, in the workspace it was
 * started in.** Every read and write below is filtered by `user_id` *and*
 * `workspace_id` — not by role, so a workspace admin can't open a member's
 * chats — and anything else reads as not found (404), never as forbidden, so a
 * guessed id says nothing about whether it exists.
 *
 * The data an answer is built from is read through `lib/queries.ts`
 * (`gatherChatData`), so it is scoped to the profiles the asker can see in the
 * current workspace and excludes the trash, exactly like the tracker.
 */

/** A chat in the list. */
export type ChatSummary = { id: string; title: string; updatedAt: string };

/** One message, as the page renders it. */
export type ChatMessageDTO = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** A sample answer (no model, in dev, tests or beta) — the page captions it, quietly. */
  sample: boolean;
};

/** Most chats the list shows (newest first). */
export const CHAT_LIST_LIMIT = 100;

/** Most messages a chat page loads (the newest ones). */
export const CHAT_PAGE_MESSAGES = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function summary(row: Pick<AiChat, "id" | "title" | "updatedAt">): ChatSummary {
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() };
}

function messageDTO(row: typeof aiChatMessages.$inferSelect): ChatMessageDTO {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    // A real answer always cost an action; only a sample is stored at 0.
    sample: row.role === "assistant" && row.units === 0,
  };
}

/** The caller's own chat in this workspace, or 404. */
async function ownedChat(userId: string, workspaceId: string, chatId: string): Promise<AiChat> {
  // A malformed id can't be anyone's chat — and would be a Postgres error
  // ("invalid input syntax for type uuid") if it reached the query.
  if (!UUID_RE.test(chatId)) throw notFound("That chat doesn't exist");
  const [row] = await getDb()
    .select()
    .from(aiChats)
    .where(
      and(eq(aiChats.id, chatId), eq(aiChats.userId, userId), eq(aiChats.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!row) throw notFound("That chat doesn't exist");
  return row;
}

/** The caller's chats in this workspace, newest first. */
export async function listChats(userId: string, workspaceId: string): Promise<ChatSummary[]> {
  const rows = await getDb()
    .select({ id: aiChats.id, title: aiChats.title, updatedAt: aiChats.updatedAt })
    .from(aiChats)
    .where(and(eq(aiChats.userId, userId), eq(aiChats.workspaceId, workspaceId)))
    .orderBy(desc(aiChats.updatedAt), desc(aiChats.id))
    .limit(CHAT_LIST_LIMIT);
  return rows.map(summary);
}

/**
 * The workspace's AI actions left this month, for the composers' count — a
 * promise the pages start and never await. A failure resolves to null (no
 * count) rather than an error boundary: the line is a hint, not the page.
 */
export function aiActionsLeftFor(workspaceId: string): Promise<AiActionsLeft | null> {
  return getAiAllowance(workspaceId)
    .then((a) => ({ remaining: a.remaining, limit: a.limit, resetsAt: a.resetsAt }))
    .catch((err: unknown) => {
      logger.warn(`The AI actions count failed: ${describeError(err)}`, {
        event: "ai.allowance.count_failed",
        error: err,
      });
      return null;
    });
}

/** The newest `limit` messages of a chat, oldest first. */
async function newestMessages(chatId: string, limit: number) {
  const rows = await getDb()
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.chatId, chatId))
    .orderBy(desc(aiChatMessages.createdAt), desc(aiChatMessages.id))
    .limit(limit);
  return rows.reverse();
}

/** One of the caller's chats with its messages, or 404. */
export async function getChat(
  userId: string,
  workspaceId: string,
  chatId: string,
): Promise<{ chat: ChatSummary; messages: ChatMessageDTO[] }> {
  const chat = await ownedChat(userId, workspaceId, chatId);
  const messages = await newestMessages(chat.id, CHAT_PAGE_MESSAGES);
  return { chat: summary(chat), messages: messages.map(messageDTO) };
}

export async function renameChat(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<ChatSummary> {
  const { chatId, title } = parseOrThrow(renameAiChatSchema, input);
  await ownedChat(userId, workspaceId, chatId);
  const [row] = await getDb()
    .update(aiChats)
    .set({ title })
    .where(
      and(eq(aiChats.id, chatId), eq(aiChats.userId, userId), eq(aiChats.workspaceId, workspaceId)),
    )
    .returning({ id: aiChats.id, title: aiChats.title, updatedAt: aiChats.updatedAt });
  if (!row) throw notFound("That chat doesn't exist");
  return summary(row);
}

/** Delete one of the caller's chats; its messages go with it (FK cascade). */
export async function deleteChat(userId: string, workspaceId: string, chatId: string): Promise<void> {
  await ownedChat(userId, workspaceId, chatId);
  const deleted = await getDb()
    .delete(aiChats)
    .where(
      and(eq(aiChats.id, chatId), eq(aiChats.userId, userId), eq(aiChats.workspaceId, workspaceId)),
    )
    .returning({ id: aiChats.id });
  if (deleted.length === 0) throw notFound("That chat doesn't exist");
}

// ── The data an answer is built from ───────────────────────────────────────

function chatTxn(row: TransactionRow): ChatTxn {
  return {
    date: row.occurredOn,
    type: row.type,
    amountMinor: row.amountMinor,
    category: row.categoryName,
    title: row.title,
    description: row.description,
    profile: row.profileName,
    tags: row.tags.map((t) => t.name),
  };
}

function categoryTotals(rows: CategoryBreakdownRow[]) {
  return rows.map((r) => ({ name: r.categoryName, totalMinor: r.total }));
}

/**
 * Everything one answer is built from, for the asker in this workspace. Every
 * read is a `lib/queries.ts` read — scoped to the profiles the asker can see
 * here (`accessibleProfileIdList`) and excluding the trash — so Ask can never
 * know more than the tracker shows the same person. Ten small reads, in
 * parallel; the profile list behind them is memoized for the request.
 *
 * "This month" runs to today: a row dated later is in no total and no list
 * but its own (`upcoming`), so a future-dated bill can't inflate "so far".
 */
export async function gatherChatData(
  userId: string,
  workspace: Pick<WorkspaceSummary, "id" | "name" | "currency" | "locale">,
  today: string,
): Promise<ChatData> {
  const ws = workspace.id;
  const thisMonth = { start: monthRange(today).start, end: today };
  const lastMonth = monthRange(monthStartBack(today, 1));
  const firstMonth = monthStartBack(today, CHAT_MONTHS - 1);
  const sameDay = sameDayLastMonth(today);
  const largest = (range: { start: string; end: string }) =>
    listTransactions(userId, ws, {
      type: "expense",
      from: range.start,
      to: range.end,
      // Ascending by signed amount = the largest expense first.
      sort: "amount",
      dir: "asc",
      limit: CHAT_TOP_EXPENSES,
    });
  const [
    months,
    thisExpense,
    thisIncome,
    lastExpense,
    lastIncome,
    topThis,
    topLast,
    sameDays,
    recent,
    upcoming,
  ] = await Promise.all([
    getMonthlyTotals(userId, ws, { from: firstMonth, to: today }),
    getCategoryBreakdown(userId, ws, "expense", { from: thisMonth.start, to: thisMonth.end }),
    getCategoryBreakdown(userId, ws, "income", { from: thisMonth.start, to: thisMonth.end }),
    getCategoryBreakdown(userId, ws, "expense", { from: lastMonth.start, to: lastMonth.end }),
    getCategoryBreakdown(userId, ws, "income", { from: lastMonth.start, to: lastMonth.end }),
    largest(thisMonth),
    largest(lastMonth),
    getSummary(userId, ws, { from: lastMonth.start, to: sameDay }),
    listTransactions(userId, ws, { to: today, limit: CHAT_RECENT_TRANSACTIONS }),
    listTransactions(userId, ws, {
      from: nextDay(today),
      sort: "date",
      dir: "asc",
      limit: CHAT_UPCOMING,
    }),
  ]);
  return {
    workspaceName: workspace.name,
    currency: workspace.currency,
    locale: workspace.locale,
    today,
    months,
    categories: {
      thisMonth: { expense: categoryTotals(thisExpense), income: categoryTotals(thisIncome) },
      lastMonth: { expense: categoryTotals(lastExpense), income: categoryTotals(lastIncome) },
    },
    topExpenses: { thisMonth: topThis.map(chatTxn), lastMonth: topLast.map(chatTxn) },
    sameDaysLastMonth: { through: sameDay, income: sameDays.income, expense: sameDays.expense },
    recent: recent.map(chatTxn),
    upcoming: upcoming.map(chatTxn),
  };
}

// ── Asking ─────────────────────────────────────────────────────────────────

export type AskResult = {
  chat: ChatSummary;
  /** True when this question started the chat. */
  created: boolean;
  /** The question and its answer, as stored. */
  messages: ChatMessageDTO[];
  /** The count after this answer's charge — null for a sample, which charged nothing. */
  ai: AiActionsLeft | null;
};

/**
 * Ask one question, in one of the caller's chats or (no `chatId`) a new one.
 *
 * In order, cheapest first: the question's shape (control characters already
 * stripped by the schema), the chat's ownership (404), edit access to the
 * workspace (403 — Ask spends the workspace's shared AI actions, so it needs
 * what the composer's AI mode needs), then how this server answers
 * (`chatAnswerMode`): with no model, a sample answer in dev, tests and beta
 * (`answerWithSample` — no charge, no ledger row, no provider call) or, in
 * production, 503 "Couldn't answer right now" — both before any charge. With a
 * model: the charge — one AI action against the workspace's monthly allowance
 * (403 `plan_limit` when it's spent).
 *
 * **What a failure costs.** The data read and the provider call run inside
 * `withAiCharge`, so a failure there — nothing reached the model, or the model
 * didn't answer — gives the action back. Saving the answer runs *after* it: the
 * model did the work by then, so a failed save keeps the charge, and it's
 * reported without the question or the answer anywhere in the error or the log
 * (a database error's message quotes the statement's parameters).
 *
 * Nothing is stored until the answer is in: a failed question leaves no
 * half-chat behind, and a new chat exists only once it has an answer.
 */
export async function askQuestion(
  userId: string,
  workspace: Pick<WorkspaceSummary, "id" | "name" | "currency" | "locale">,
  input: unknown,
  today: string,
): Promise<AskResult> {
  const { chatId, question } = parseOrThrow(askAiSchema, input);
  const existing = chatId ? await ownedChat(userId, workspace.id, chatId) : null;
  if (!(await canWriteInWorkspace(userId, workspace.id))) {
    throw forbidden(ASK_NEEDS_EDIT_MESSAGE);
  }
  const mode = chatAnswerMode();
  if (mode === "unavailable") throw aiUnavailableForChat();
  if (mode === "sample") {
    return answerWithSample({ userId, workspace, existing, question, today });
  }
  const history = existing ? await newestMessages(existing.id, CHAT_HISTORY_MESSAGES) : [];
  const cfg = resolveChatModel();

  const charge = await chargeAiChat(userId, workspace.id);
  const askedAt = new Date();

  const answer = await withAiCharge(charge, async (onUsage) => {
    const data = await gatherChatData(userId, workspace, today);
    return askChatModel({ cfg, data, history, question, onUsage });
  });
  // After the question, always — the pair must sort in the order it happened.
  const answeredAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));

  try {
    return await saveAnswer({
      userId,
      workspaceId: workspace.id,
      existing,
      question,
      answer,
      askedAt,
      answeredAt,
      charge,
    });
  } catch (err) {
    // The error's name and Postgres code — never its message, which for a
    // failed insert quotes the question and the answer as the statement's
    // params. Rethrown as an ApiError for the same reason: `runAction` logs an
    // unexpected error's message.
    logger.error("An Ask answer was paid for but couldn't be saved", {
      event: "ai.chat.save_failed",
      errorName: err instanceof Error ? err.name : typeof err,
      pgCode: postgresCode(err),
      chatId: existing?.id ?? null,
    });
    // The answer goes back to the asker — it was paid for — in `details`,
    // which `runAction` returns but never logs; with it, the count the charge
    // left, so the "actions left" line still moves.
    throw new ApiError(
      500,
      "ai_chat_not_saved",
      "Here's your answer, but it couldn't be saved to this chat.",
      { answer, ai: { remaining: charge.remaining ?? 0, limit: charge.limit } },
    );
  }
}

/** The SQLSTATE behind a driver error (Drizzle wraps it in `cause`), or null. */
function postgresCode(err: unknown): string | null {
  const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined) : undefined;
  const code = cause?.code ?? (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

/** Production with no model: the same plain message a model failure would get. */
function aiUnavailableForChat(): ApiError {
  return new ApiError(503, "ai_unavailable", CHAT_UNAVAILABLE_MESSAGE);
}

/**
 * The no-model path in dev, tests and beta: a sample answer from the asker's own
 * data (`buildSampleAnswer`), stored like any answer so chats, rename and
 * delete all work — but no charge, no ledger row and no provider call. Its
 * message row records `units = 0`, which is what marks it as a sample.
 */
async function answerWithSample(opts: {
  userId: string;
  workspace: Pick<WorkspaceSummary, "id" | "name" | "currency" | "locale">;
  existing: AiChat | null;
  question: string;
  today: string;
}): Promise<AskResult> {
  const { userId, workspace, existing, question, today } = opts;
  const askedAt = new Date();
  const data = await gatherChatData(userId, workspace, today);
  const answer = cleanAnswer(buildSampleAnswer(data, `${siteConfig.url}/app/analytics`));
  const answeredAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));
  return saveAnswer({
    userId,
    workspaceId: workspace.id,
    existing,
    question,
    answer,
    askedAt,
    answeredAt,
    charge: null,
  });
}

/** Store a question and its answer, creating the chat on its first answer. */
async function saveAnswer(opts: {
  userId: string;
  workspaceId: string;
  existing: AiChat | null;
  question: string;
  answer: string;
  askedAt: Date;
  answeredAt: Date;
  /** What the answer cost; null for a sample, stored at 0 units. */
  charge: AiCharge | null;
}): Promise<AskResult> {
  const { userId, workspaceId, existing, question, answer, askedAt, answeredAt, charge } = opts;
  return getDb().transaction(async (tx) => {
    let chat: AiChat | undefined;
    if (existing) {
      [chat] = await tx
        .update(aiChats)
        .set({ updatedAt: answeredAt })
        .where(
          and(
            eq(aiChats.id, existing.id),
            eq(aiChats.userId, userId),
            eq(aiChats.workspaceId, workspaceId),
          ),
        )
        .returning();
    }
    // A new chat — or one deleted in another tab while this was being
    // answered, which comes back rather than losing the answer just paid for.
    const created = !chat;
    if (!chat) {
      [chat] = await tx
        .insert(aiChats)
        .values({
          userId,
          workspaceId,
          title: chatTitleFrom(question),
          createdAt: askedAt,
          updatedAt: answeredAt,
        })
        .returning();
    }
    const rows = await tx
      .insert(aiChatMessages)
      .values([
        { chatId: chat!.id, role: "user", content: question, createdAt: askedAt },
        {
          chatId: chat!.id,
          role: "assistant",
          content: answer,
          units: charge?.units ?? 0,
          createdAt: answeredAt,
        },
      ])
      .returning();
    return {
      chat: summary(chat!),
      created,
      messages: rows
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(messageDTO),
      ai: charge ? { remaining: charge.remaining ?? 0, limit: charge.limit } : null,
    };
  });
}
