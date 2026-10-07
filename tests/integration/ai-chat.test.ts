import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { and, asc, eq } from "drizzle-orm";
import { askAi, deleteAiChat, renameAiChat } from "@/actions/ai-chat";
import {
  aiChatMessages,
  aiChats,
  aiUsageLog,
  profiles,
  spaceMembers,
  spaces,
  userSettings,
  workspaceMembers,
} from "@/db/schema";
import { buildChatContext } from "@/lib/ai-chat";
import { ASK_NEEDS_EDIT_MESSAGE } from "@/lib/ai-limits";
import { logger } from "@/lib/logger";
import { monthStartBack, todayISO } from "@/lib/dates";
import { PLAN_LIMITS } from "@/lib/plans";
import { aiActionsLeftFor, gatherChatData, getChat, listChats } from "@/services/ai-chat";
import { deleteProfile } from "@/services/profiles";
import { deleteAccount } from "@/services/settings";
import { deleteTransaction } from "@/services/transactions";
import { removeMember } from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  workspaceIdOf,
} from "./helpers/seed";
import { seedProfile } from "./helpers/vault-seed";
import { getTestDb } from "./helpers/test-db";

/**
 * Ask, end to end against real SQL with a stubbed provider:
 *
 *  - **What an answer can see** — `gatherChatData` reads through
 *    `lib/queries.ts`, so the trash and profile access apply; here that's
 *    proven on seeded rows (the static half is the AST tripwire in
 *    `tests/unit/trash-coverage.test.ts`, which sees no new raw reads).
 *  - **What a question costs** — one AI action, charged before the provider and
 *    given back when we fail, with nothing stored for a failed question.
 *  - **Whose chats are whose** — private to their author within a workspace;
 *    anyone else gets a 404, admins included.
 */

const db = () => getTestDb();
const TODAY = todayISO();
const THIS_MONTH_DAY = `${TODAY.slice(0, 7)}-01`;
const LAST_MONTH_DAY = monthStartBack(TODAY, 1);

/** A Gemini stub for Ask: captures each request, answers in Markdown. */
function stubGemini({ fail = false, answer = "**Food** — $12.50 this month." } = {}) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const spy = vi.fn(async (url: string, init?: { body?: unknown }) => {
    requests.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (fail) return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: answer }] } }],
        usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 60 },
      }),
      text: async () => "",
    };
  });
  vi.stubGlobal("fetch", spy);
  return { spy, requests };
}

/** Ask's own model, plus a parse model that must never be used for it. */
function configureChat() {
  vi.stubEnv("AI_CHAT_MODEL", JSON.stringify({ chat: { model_id: "gemini-chat", api_key: "k" } }));
  vi.stubEnv("AI_CHAT_MODEL_CURRENT", "chat");
  vi.stubEnv("AI_PARSE_MODEL", JSON.stringify({ parse: { model_id: "gemini-parse", api_key: "k" } }));
  vi.stubEnv("AI_PARSE_MODEL_CURRENT", "parse");
}

/** The system prompt of a captured Gemini request. */
function systemOf(req: { body: Record<string, unknown> }): string {
  return (req.body.systemInstruction as { parts: { text: string }[] }).parts[0]!.text;
}

async function ledger(alias: string) {
  return db()
    .select({ kind: aiUsageLog.kind, units: aiUsageLog.units, inputTokens: aiUsageLog.inputTokens })
    .from(aiUsageLog)
    .where(eq(aiUsageLog.userId, uid(alias)))
    .orderBy(asc(aiUsageLog.createdAt));
}

/**
 * `mem` joins `own`'s workspace in its default space only — an editor unless
 * told otherwise (Ask needs edit access) — and opens it.
 */
async function addMember(ownerAlias: string, memberAlias: string, role: "viewer" | "editor" = "editor") {
  const W = await workspaceIdOf(ownerAlias);
  await bootstrapUser(memberAlias);
  await db().insert(workspaceMembers).values({ workspaceId: W, userId: uid(memberAlias), role });
  await db()
    .insert(spaceMembers)
    .values({ spaceId: await defaultSpaceIdOf(W), userId: uid(memberAlias), role });
  await db().update(userSettings).set({ lastWorkspaceId: W }).where(eq(userSettings.userId, uid(memberAlias)));
  return W;
}

const workspaceOf = (id: string) => ({ id, name: "Home", currency: "USD", locale: "en-US" });

beforeEach(() => configureChat());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("gatherChatData — what an answer can see", () => {
  it("leaves out the trash: a trashed transaction, and the rows of a trashed profile", async () => {
    await bootstrapUser("own");
    const W = await workspaceIdOf("own");
    const personal = await firstProfileId("own");
    const old = await seedProfile("own", "Old");
    await insertTxn("own", { type: "expense", amountMinor: 1250, occurredOn: THIS_MONTH_DAY, profileId: personal, title: "live lunch" });
    const trashed = await insertTxn("own", { type: "expense", amountMinor: 9900, occurredOn: THIS_MONTH_DAY, profileId: personal, title: "trashed taxi" });
    await insertTxn("own", { type: "expense", amountMinor: 7700, occurredOn: THIS_MONTH_DAY, profileId: old, title: "old rent" });
    expect(await deleteTransaction(uid("own"), W, trashed)).toBe(true);
    expect(await deleteProfile(uid("own"), old, { transactions: "delete" })).toBe(true);

    const text = buildChatContext(await gatherChatData(uid("own"), workspaceOf(W), TODAY));
    expect(text).toContain("live lunch");
    expect(text).not.toContain("trashed taxi");
    expect(text).not.toContain("old rent");
    // The totals are live-only too.
    expect(text).toContain(`${TODAY.slice(0, 7)} (to date) | 0.00 | 12.50 | -12.50`);
    expect(text).not.toContain("99.00");
    expect(text).not.toContain("77.00");
  });

  it("is scoped to the profiles the asker can see — a member never sees another space", async () => {
    await bootstrapUser("own");
    const W = await workspaceIdOf("own");
    const [family] = await db().insert(spaces).values({ workspaceId: W, name: "Family", position: 1 }).returning({ id: spaces.id });
    const [kids] = await db()
      .insert(profiles)
      .values({ userId: uid("own"), workspaceId: W, spaceId: family!.id, name: "Kids", sortOrder: 2 })
      .returning({ id: profiles.id });
    await insertTxn("own", { type: "expense", amountMinor: 1250, occurredOn: THIS_MONTH_DAY, title: "live lunch" });
    await insertTxn("own", { type: "expense", amountMinor: 4000, occurredOn: LAST_MONTH_DAY, profileId: kids!.id, title: "kids shoes" });
    await addMember("own", "mem", "viewer");

    const theirs = buildChatContext(await gatherChatData(uid("mem"), workspaceOf(W), TODAY));
    expect(theirs).toContain("live lunch");
    expect(theirs).not.toContain("kids shoes");
    expect(theirs).not.toContain("40.00");

    const owners = buildChatContext(await gatherChatData(uid("own"), workspaceOf(W), TODAY));
    expect(owners).toContain("kids shoes");
  });

  it("runs 'this month' to today: later rows are listed apart, and last month's same days are summed", async () => {
    await bootstrapUser("own");
    const W = await workspaceIdOf("own");
    const T = "2026-10-07";
    await insertTxn("own", { type: "expense", amountMinor: 1000, occurredOn: "2026-10-05", title: "so far lunch" });
    await insertTxn("own", { type: "expense", amountMinor: 50000, occurredOn: "2026-10-20", title: "future rent" });
    await insertTxn("own", { type: "expense", amountMinor: 2000, occurredOn: "2026-09-03", title: "early sept" });
    await insertTxn("own", { type: "expense", amountMinor: 4000, occurredOn: "2026-09-25", title: "late sept" });

    const text = buildChatContext(await gatherChatData(uid("own"), workspaceOf(W), T));
    expect(text).toContain("2026-10 (to date) | 0.00 | 10.00 | -10.00");
    expect(text).toContain("2026-10-01 to 2026-10-07 | 0.00 | 10.00 | -10.00");
    expect(text).toContain("2026-09-01 to 2026-09-07 | 0.00 | 20.00 | -20.00");
    expect(text).toContain("2026-09 | 0.00 | 60.00 | -60.00");
    expect(text).toContain("## Dated after today");
    expect(text).toMatch(/## Dated after today[^\n]*\n[^\n]*\n2026-10-20 \| expense \| 500\.00 \| - \| future rent/);
    // Only there — not among this month's largest or the recent rows.
    expect(text.split("future rent")).toHaveLength(2);
  });

  it("never reads another workspace", async () => {
    await bootstrapUser("own");
    await bootstrapUser("oth");
    await insertTxn("oth", { type: "expense", amountMinor: 3100, occurredOn: THIS_MONTH_DAY, title: "other secret" });
    const text = buildChatContext(
      await gatherChatData(uid("own"), workspaceOf(await workspaceIdOf("own")), TODAY),
    );
    expect(text).not.toContain("other secret");
    // Nothing anywhere for "own": every list is empty, every total zero.
    expect(text).toContain("(none)");
    expect(text).toContain(`${TODAY.slice(0, 7)} (to date) | 0.00 | 0.00 | 0.00`);
  });
});

describe("askAi — what a question costs", () => {
  it("charges one action, answers from the data with the chat model, and stores the pair", async () => {
    const { requests } = stubGemini();
    signInAs("own");
    await bootstrapUser("own");
    await insertTxn("own", { type: "expense", amountMinor: 1250, occurredOn: THIS_MONTH_DAY, title: "live lunch" });

    const res = await askAi({ question: "How much did I spend on food this month?" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(true);
    expect(res.chat.title).toBe("How much did I spend on food this month?");
    expect(res.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "How much did I spend on food this month?"],
      ["assistant", "**Food** — $12.50 this month."],
    ]);
    expect(res.ai).toEqual({ remaining: PLAN_LIMITS.free.aiActionsPerMonth - 1, limit: PLAN_LIMITS.free.aiActionsPerMonth });

    // The chat model, never the parse model; the data rides in the system prompt.
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toContain("/models/gemini-chat:");
    expect(systemOf(requests[0]!)).toContain("live lunch");
    expect(systemOf(requests[0]!)).toContain("Every amount is in USD");

    expect(await ledger("own")).toEqual([{ kind: "ai_chat", units: 1, inputTokens: 1500 }]);
    const stored = await db().select().from(aiChatMessages).where(eq(aiChatMessages.chatId, res.chat.id));
    expect(stored.find((m) => m.role === "assistant")?.units).toBe(1);
    expect((await aiActionsLeftFor(await workspaceIdOf("own")))?.remaining).toBe(
      PLAN_LIMITS.free.aiActionsPerMonth - 1,
    );
  });

  it("sends the earlier turns with a follow-up, and moves the chat to the top", async () => {
    const { requests } = stubGemini();
    signInAs("own");
    await bootstrapUser("own");
    const first = await askAi({ question: "Top 5 expenses this month" });
    const other = await askAi({ question: "Another chat" });
    if (!first.ok || !other.ok) throw new Error("expected answers");

    const follow = await askAi({ chatId: first.chat.id, question: "And last month?" });
    expect(follow.ok).toBe(true);
    if (!follow.ok) return;
    expect(follow.created).toBe(false);
    const contents = requests[2]!.body.contents as { role: string; parts: { text: string }[] }[];
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents[0]!.parts[0]!.text).toBe("Top 5 expenses this month");

    const W = await workspaceIdOf("own");
    expect((await listChats(uid("own"), W)).map((c) => c.id)).toEqual([first.chat.id, other.chat.id]);
    expect((await getChat(uid("own"), W, first.chat.id)).messages).toHaveLength(4);
  });

  it("gives the action back when the AI fails on our side — and stores nothing", async () => {
    stubGemini({ fail: true });
    signInAs("own");
    await bootstrapUser("own");

    const res = await askAi({ question: "How much on food?" });
    expect(res).toMatchObject({ ok: false, code: "ai_failed" });
    expect(await ledger("own")).toEqual([{ kind: "ai_chat_failed", units: 0, inputTokens: null }]);
    expect(await db().select().from(aiChats)).toHaveLength(0);
    expect((await aiActionsLeftFor(await workspaceIdOf("own")))?.remaining).toBe(
      PLAN_LIMITS.free.aiActionsPerMonth,
    );
  });

  it("refuses with plan_limit once the allowance is spent — provider never reached", async () => {
    const { spy } = stubGemini();
    signInAs("own");
    await bootstrapUser("own");
    const W = await workspaceIdOf("own");
    await db().insert(aiUsageLog).values({
      userId: uid("own"),
      workspaceId: W,
      kind: "transaction_parse",
      units: PLAN_LIMITS.free.aiActionsPerMonth,
      ownerId: uid("own"),
      plan: "free",
    });

    const res = await askAi({ question: "How much on food?" });
    expect(res).toMatchObject({ ok: false, code: "plan_limit", details: { limit: "aiActions", upgradeTo: "plus" } });
    expect(spy).not.toHaveBeenCalled();
    expect(await db().select().from(aiChats)).toHaveLength(0);
    expect((await aiActionsLeftFor(W))?.remaining).toBe(0);
  });

  it("is 'not set up' without its own model — even with a parse model — and charges nothing", async () => {
    const { spy } = stubGemini();
    vi.stubEnv("AI_CHAT_MODEL", "");
    vi.stubEnv("AI_CHAT_MODEL_CURRENT", "");
    signInAs("own");
    await bootstrapUser("own");

    const res = await askAi({ question: "How much on food?" });
    expect(res).toMatchObject({ ok: false, code: "ai_unavailable", error: "Ask isn't set up on this server." });
    expect(spy).not.toHaveBeenCalled();
    expect(await ledger("own")).toEqual([]);
  });

  it("checks the question before anything else", async () => {
    const { spy } = stubGemini();
    signInAs("own");
    await bootstrapUser("own");
    expect(await askAi({ question: "   " })).toMatchObject({ ok: false, code: "validation_error" });
    expect(await askAi({ question: "x".repeat(1001) })).toMatchObject({ ok: false, code: "validation_error" });
    expect(spy).not.toHaveBeenCalled();
    expect(await ledger("own")).toEqual([]);
  });

  it("needs edit access — a viewer can't spend the workspace's shared actions", async () => {
    const { spy } = stubGemini();
    await bootstrapUser("own");
    await addMember("own", "mem", "viewer");
    signInAs("mem");
    expect(await askAi({ question: "Top 5 expenses this month" })).toMatchObject({
      ok: false,
      code: "forbidden",
      error: ASK_NEEDS_EDIT_MESSAGE,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(await ledger("mem")).toEqual([]);

    // An editor in the same workspace asks fine.
    await addMember("own", "ed");
    signInAs("ed");
    expect((await askAi({ question: "Top 5 expenses this month" })).ok).toBe(true);
  });

  it("strips control characters from the question and the answer — a NUL can't fail the save", async () => {
    stubGemini({ answer: "Food\u0000 is **$12.50**\u0007." });
    signInAs("own");
    await bootstrapUser("own");
    const res = await askAi({ question: "How much\u0000 on food?" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const stored = await db()
      .select({ role: aiChatMessages.role, content: aiChatMessages.content })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.chatId, res.chat.id))
      .orderBy(asc(aiChatMessages.createdAt));
    expect(stored).toEqual([
      { role: "user", content: "How much on food?" },
      { role: "assistant", content: "Food is **$12.50**." },
    ]);
    expect(res.chat.title).toBe("How much on food?");
    expect(await ledger("own")).toEqual([{ kind: "ai_chat", units: 1, inputTokens: 1500 }]);
  });

  it("keeps the charge when saving fails after the model answered — and logs neither text", async () => {
    stubGemini({ answer: "SECRET-ANSWER Food is $12.50." });
    signInAs("own");
    await bootstrapUser("own");
    // The charge is the first transaction; the save, the second, fails the way
    // a driver error does — quoting the statement's parameters in its message.
    const testDb = db();
    const realTransaction = testDb.transaction.bind(testDb);
    let calls = 0;
    vi.spyOn(testDb, "transaction").mockImplementation(((fn: Parameters<typeof realTransaction>[0]) =>
      ++calls === 2
        ? Promise.reject(
            Object.assign(
              new Error('Failed query: insert into "ai_chat_messages" params: SECRET-QUESTION,SECRET-ANSWER'),
              { cause: { code: "22021" } },
            ),
          )
        : realTransaction(fn)) as typeof testDb.transaction);
    const logged = [
      vi.spyOn(logger, "error"),
      vi.spyOn(logger, "warn"),
      vi.spyOn(logger, "info"),
      vi.spyOn(logger, "debug"),
    ];

    const res = await askAi({ question: "SECRET-QUESTION on food?" });
    expect(res).toMatchObject({ ok: false, code: "ai_chat_not_saved" });
    expect(JSON.stringify(res)).not.toContain("SECRET");
    // The model did the work: no refund.
    expect(await ledger("own")).toEqual([{ kind: "ai_chat", units: 1, inputTokens: 1500 }]);
    expect(await db().select().from(aiChats)).toHaveLength(0);

    const messages = logged.flatMap((spy) => spy.mock.calls.map((c) => String(c[0])));
    expect(messages).toContain("An Ask answer was paid for but couldn't be saved");
    expect(messages.filter((m) => m.includes("SECRET"))).toEqual([]);
    const saveFailed = logged[0]!.mock.calls.find((c) => c[0] === "An Ask answer was paid for but couldn't be saved");
    expect(saveFailed?.[1]).toMatchObject({ event: "ai.chat.save_failed", pgCode: "22021", errorName: "Error" });
    expect(JSON.stringify(saveFailed?.[1])).not.toContain("SECRET");
    for (const spy of logged) spy.mockRestore();
    vi.mocked(testDb.transaction).mockRestore();
  });
});

describe("chats are private to their author, in their workspace", () => {
  async function ownersChat() {
    stubGemini();
    signInAs("own");
    await bootstrapUser("own");
    const res = await askAi({ question: "How much on food?" });
    if (!res.ok) throw new Error(res.error);
    return { W: await workspaceIdOf("own"), chatId: res.chat.id };
  }

  it("another user's chat is a 404 everywhere: open, ask in, rename, delete, list", async () => {
    const { W, chatId } = await ownersChat();
    const { spy } = stubGemini();
    signInAs("oth");
    await bootstrapUser("oth");
    const theirW = await workspaceIdOf("oth");

    await expect(getChat(uid("oth"), theirW, chatId)).rejects.toMatchObject({ status: 404 });
    await expect(getChat(uid("oth"), W, chatId)).rejects.toMatchObject({ status: 404 });
    expect(await askAi({ chatId, question: "and?" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await renameAiChat({ chatId, title: "mine now" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await deleteAiChat(chatId)).toMatchObject({ ok: false, code: "not_found" });
    expect(await listChats(uid("oth"), theirW)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect(await ledger("oth")).toEqual([]);

    const [still] = await db().select().from(aiChats).where(eq(aiChats.id, chatId));
    expect(still?.title).toBe("How much on food?");
  });

  it("a workspace admin can't open a member's chat in the same workspace", async () => {
    stubGemini();
    await bootstrapUser("own");
    const W = await addMember("own", "mem");
    signInAs("mem");
    const res = await askAi({ question: "Top 5 expenses this month" });
    if (!res.ok) throw new Error(res.error);

    await expect(getChat(uid("own"), W, res.chat.id)).rejects.toMatchObject({ status: 404 });
    expect(await listChats(uid("own"), W)).toEqual([]);
    expect((await listChats(uid("mem"), W)).map((c) => c.id)).toEqual([res.chat.id]);
  });

  it("a chat stays in the workspace it was started in", async () => {
    stubGemini();
    await bootstrapUser("own");
    const W = await addMember("own", "mem");
    signInAs("mem");
    const res = await askAi({ question: "Top 5 expenses this month" });
    if (!res.ok) throw new Error(res.error);
    const home = await workspaceIdOf("mem");
    await expect(getChat(uid("mem"), home, res.chat.id)).rejects.toMatchObject({ status: 404 });
    expect(await listChats(uid("mem"), home)).toEqual([]);
    expect((await getChat(uid("mem"), W, res.chat.id)).chat.id).toBe(res.chat.id);
  });

  it("a malformed id is a 404, not a database error", async () => {
    await bootstrapUser("own");
    await expect(getChat(uid("own"), await workspaceIdOf("own"), "not-a-uuid")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("the author can rename and delete; delete takes the messages", async () => {
    const { W, chatId } = await ownersChat();
    const renamed = await renameAiChat({ chatId, title: "  Food spend  " });
    expect(renamed).toMatchObject({ ok: true, chat: { id: chatId, title: "Food spend" } });
    expect(await renameAiChat({ chatId, title: "" })).toMatchObject({ ok: false, code: "validation_error" });

    expect(await deleteAiChat(chatId)).toEqual({ ok: true });
    expect(await listChats(uid("own"), W)).toEqual([]);
    expect(await db().select().from(aiChatMessages).where(eq(aiChatMessages.chatId, chatId))).toHaveLength(0);
  });

  it("removal from a workspace takes the person's chats there — not elsewhere, not anyone else's", async () => {
    stubGemini();
    await bootstrapUser("own");
    const W = await addMember("own", "mem");
    signInAs("mem");
    const there = await askAi({ question: "In own's workspace" });
    await db().update(userSettings).set({ lastWorkspaceId: await workspaceIdOf("mem") }).where(eq(userSettings.userId, uid("mem")));
    const home = await askAi({ question: "In my own" });
    signInAs("own");
    const owners = await askAi({ question: "Owner's own chat" });
    if (!there.ok || !home.ok || !owners.ok) throw new Error("expected answers");

    await removeMember(uid("own"), W, uid("mem"));

    expect(await db().select().from(aiChats).where(eq(aiChats.id, there.chat.id))).toEqual([]);
    expect(
      await db().select().from(aiChatMessages).where(eq(aiChatMessages.chatId, there.chat.id)),
    ).toEqual([]);
    expect((await listChats(uid("mem"), await workspaceIdOf("mem"))).map((c) => c.id)).toEqual([home.chat.id]);
    expect((await listChats(uid("own"), W)).map((c) => c.id)).toEqual([owners.chat.id]);
  });

  it("leaving a workspace takes your chats there too", async () => {
    stubGemini();
    await bootstrapUser("own");
    const W = await addMember("own", "mem");
    signInAs("mem");
    const there = await askAi({ question: "In own's workspace" });
    if (!there.ok) throw new Error(there.error);
    await removeMember(uid("mem"), W, uid("mem"));
    expect(await db().select().from(aiChats).where(eq(aiChats.userId, uid("mem")))).toEqual([]);
  });

  it("account deletion removes the person's chats — in their workspace and in others'", async () => {
    stubGemini();
    await bootstrapUser("own");
    const W = await addMember("own", "mem");
    signInAs("mem");
    const there = await askAi({ question: "In own's workspace" });
    await db().update(userSettings).set({ lastWorkspaceId: await workspaceIdOf("mem") }).where(eq(userSettings.userId, uid("mem")));
    const home = await askAi({ question: "In my own" });
    if (!there.ok || !home.ok) throw new Error("expected answers");
    signInAs("own");
    const ownersRes = await askAi({ question: "Owner's own chat" });
    if (!ownersRes.ok) throw new Error(ownersRes.error);

    await deleteAccount(uid("mem"), "DELETE");

    expect(await db().select().from(aiChats).where(eq(aiChats.userId, uid("mem")))).toEqual([]);
    expect(
      await db().select().from(aiChatMessages).where(eq(aiChatMessages.chatId, there.chat.id)),
    ).toEqual([]);
    // The owner's chat in the same workspace is untouched.
    expect(
      await db().select().from(aiChats).where(and(eq(aiChats.workspaceId, W), eq(aiChats.userId, uid("own")))),
    ).toHaveLength(1);
  });
});
