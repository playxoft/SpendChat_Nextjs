import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppContext } from "@/lib/auth";
import { chatAnswerMode } from "@/lib/ai-chat";
import { ApiError } from "@/lib/errors";
import { aiActionsLeftFor, getChat, listChats } from "@/services/ai-chat";
import { AskPanel } from "@/components/app/ask/ask-panel";
import { AskView } from "@/components/app/ask/ask-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SpendChat AI",
  robots: { index: false, follow: false },
};

/**
 * SpendChat AI (called Ask in code, and at `/app/ask`): questions about your
 * money, answered from your transactions. `/app/ask`
 * is a new chat; `/app/ask?c=<id>` opens one of your own (anyone else's is a
 * 404). The chat list is a column beside the sidebar on desktop (`AskPanel`,
 * part of this page — see there for why) and a sheet on smaller screens.
 */
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const chatParam = Array.isArray(sp.c) ? sp.c[0] : sp.c;
  const { user, workspace } = await getAppContext();
  // Same page either way: no model means sample answers in dev and beta and a
  // plain per-question error anywhere else — never a "not set up" screen.
  const mode = chatAnswerMode();

  const [chats, opened, allowance] = await Promise.all([
    listChats(user.id, workspace.id),
    chatParam
      ? getChat(user.id, workspace.id, chatParam).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        })
      : null,
    // Awaited here (unlike the tracker, which streams it): this page has the
    // chat to read anyway, the count runs beside it, and the composer needs it
    // to lock the send button at zero.
    aiActionsLeftFor(workspace.id),
  ]);
  if (chatParam && !opened) notFound();

  return (
    <div className="flex">
      <AskPanel chats={chats} />
      <div className="min-w-0 flex-1">
        <AskView
          // No `key`: the view stays mounted when a first answer gives the chat
          // its id (a draft typed meanwhile survives), and resets itself when
          // another chat is opened — see `AskView`.
          chatId={opened?.chat.id ?? null}
          title={opened?.chat.title ?? null}
          initialMessages={opened?.messages ?? []}
          chats={chats}
          sampleAnswers={mode === "sample"}
          allowance={allowance}
          workspaceName={workspace.name}
        />
      </div>
    </div>
  );
}
