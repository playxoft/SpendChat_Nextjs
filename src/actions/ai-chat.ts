"use server";

import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import type { AskAiInput, RenameAiChatInput } from "@/lib/validation";
import * as chats from "@/services/ai-chat";

/**
 * Server actions for Ask — the web app's only door to `services/ai-chat.ts`
 * (there is no `/api/v1` route for it yet).
 *
 * None of them revalidates a path. The page keeps the conversation in client
 * state while it's open and asks the router for fresh server data itself
 * (`router.refresh()` / `replace`) — a revalidation here would re-render the
 * page under a question that is still being answered.
 */

/**
 * Ask one question about the workspace's money. Costs one AI action, so it is
 * rate limited in the `ai` bucket (abuse rule C8) and charged against the
 * workspace's monthly allowance — see `askQuestion` for the order of checks
 * and the refund on our failures. Viewers may ask: it reads only what they can
 * already see.
 */
export async function askAi(input: AskAiInput): Promise<ActionResult<chats.AskResult>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "askAi",
    async () => {
      // "This month" is the asker's calendar month, as on the tracker.
      const today = todayISO(await getTimeZone());
      return chats.askQuestion(user.id, workspace, input, today);
    },
    { userId: user.id, rateLimit: "ai", workspaceId: workspace.id },
  );
}

/** Rename one of the caller's chats. Another person's chat is a 404. */
export async function renameAiChat(
  input: RenameAiChatInput,
): Promise<ActionResult<{ chat: chats.ChatSummary }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "renameAiChat",
    async () => ({ chat: await chats.renameChat(user.id, workspace.id, input) }),
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Delete one of the caller's chats and its messages. Another person's chat is a 404. */
export async function deleteAiChat(chatId: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteAiChat",
    async () => {
      await chats.deleteChat(user.id, workspace.id, typeof chatId === "string" ? chatId : "");
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}
