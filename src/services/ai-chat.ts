import "server-only";
import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiChatMessages, aiChats, type AiChat } from "@/db/schema";
import {
  askChatModel,
  chatTitleFrom,
  CHAT_HISTORY_MESSAGES,
  CHAT_MONTHS,
  CHAT_RECENT_TRANSACTIONS,
  CHAT_TOP_EXPENSES,
  resolveChatModel,
  type ChatData,
  type ChatTxn,
} from "@/lib/ai-chat";
import type { AiActionsLeft } from "@/lib/ai-limits";
import { chargeAiChat, withAiCharge } from "@/lib/ai-quota";
import { parseOrThrow } from "@/lib/api-response";
import { monthRange, monthStartBack } from "@/lib/dates";
import { getAiAllowance } from "@/lib/entitlements";
import { notFound } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import {
  getCategoryBreakdown,
  getMonthlyTotals,
  listTransactions,
  type CategoryBreakdownRow,
  type TransactionRow,
} from "@/lib/queries";
import { askAiSchema, renameAiChatSchema } from "@/lib/validation";
import type { WorkspaceSummary } from "@/lib/workspaces";

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
  return { id: row.id, role: row.role, content: row.content, createdAt: row.createdAt.toISOString() };
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
 * `listChats`, memoized for one render: the chat page (its phone sheet) and
 * the desktop panel beside it both list the chats in the same RSC pass.
 */
export const listChatsForRender = cache(listChats);

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
 * know more than the tracker shows the same person. Eight small reads, in
 * parallel; the profile list behind them is memoized for the request.
 */
export async function gatherChatData(
  userId: string,
  workspace: Pick<WorkspaceSummary, "id" | "name" | "currency" | "locale">,
  today: string,
): Promise<ChatData> {
  const ws = workspace.id;
  const thisMonth = monthRange(today);
  const lastMonth = monthRange(monthStartBack(today, 1));
  const firstMonth = monthStartBack(today, CHAT_MONTHS - 1);
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
  const [months, thisExpense, thisIncome, lastExpense, lastIncome, topThis, topLast, recent] =
    await Promise.all([
      getMonthlyTotals(userId, ws, { from: firstMonth, to: thisMonth.end }),
      getCategoryBreakdown(userId, ws, "expense", { from: thisMonth.start, to: thisMonth.end }),
      getCategoryBreakdown(userId, ws, "income", { from: thisMonth.start, to: thisMonth.end }),
      getCategoryBreakdown(userId, ws, "expense", { from: lastMonth.start, to: lastMonth.end }),
      getCategoryBreakdown(userId, ws, "income", { from: lastMonth.start, to: lastMonth.end }),
      largest(thisMonth),
      largest(lastMonth),
      listTransactions(userId, ws, { limit: CHAT_RECENT_TRANSACTIONS }),
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
    recent: recent.map(chatTxn),
  };
}

// ── Asking ─────────────────────────────────────────────────────────────────

export type AskResult = {
  chat: ChatSummary;
  /** True when this question started the chat. */
  created: boolean;
  /** The question and its answer, as stored. */
  messages: ChatMessageDTO[];
  ai: AiActionsLeft;
};

/**
 * Ask one question, in one of the caller's chats or (no `chatId`) a new one.
 *
 * In order, cheapest first: the question's shape, the chat's ownership (404),
 * the model's configuration (503 "not set up" — before the charge, so an
 * unconfigured server writes no ledger row), then the charge — one AI action
 * against the workspace's monthly allowance (403 `plan_limit` when it's spent).
 * Everything after the charge runs inside `withAiCharge`, so a failure on our
 * side — the provider, the data read, saving the answer — gives the action back.
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
  const history = existing ? await newestMessages(existing.id, CHAT_HISTORY_MESSAGES) : [];
  const cfg = resolveChatModel();

  const charge = await chargeAiChat(userId, workspace.id);
  const askedAt = new Date();

  return withAiCharge(charge, async (onUsage) => {
    const data = await gatherChatData(userId, workspace, today);
    const answer = await askChatModel({ cfg, data, history, question, onUsage });
    // After the question, always — the pair must sort in the order it happened.
    const answeredAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));

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
              eq(aiChats.workspaceId, workspace.id),
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
            workspaceId: workspace.id,
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
            units: charge.units,
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
        ai: { remaining: charge.remaining ?? 0, limit: charge.limit },
      };
    });
  });
}
