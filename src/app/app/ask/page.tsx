import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppContext } from "@/lib/auth";
import { isChatConfigured } from "@/lib/ai-chat";
import { ApiError } from "@/lib/errors";
import { aiActionsLeftFor, getChat, listChatsForRender } from "@/services/ai-chat";
import { AskView } from "@/components/app/ask/ask-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ask",
  robots: { index: false, follow: false },
};

/**
 * Ask: questions about your money, answered from your transactions. `/app/ask`
 * is a new chat; `/app/ask?c=<id>` opens one of your own (anyone else's is a
 * 404). The chat list sits in the layout's `@panel` slot on desktop and in a
 * sheet on smaller screens.
 */
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const chatParam = Array.isArray(sp.c) ? sp.c[0] : sp.c;
  const { user, workspace } = await getAppContext();
  const configured = isChatConfigured();

  const [chats, opened, allowance] = await Promise.all([
    listChatsForRender(user.id, workspace.id),
    chatParam
      ? getChat(user.id, workspace.id, chatParam).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        })
      : null,
    // Awaited here (unlike the tracker, which streams it): this page has the
    // chat to read anyway, the count runs beside it, and the composer needs it
    // to lock the send button at zero.
    configured ? aiActionsLeftFor(workspace.id) : null,
  ]);
  if (chatParam && !opened) notFound();

  return (
    <AskView
      // One mount per chat: opening another one — or the first answer giving a
      // new chat its id — starts from the stored messages.
      key={opened?.chat.id ?? "new"}
      chatId={opened?.chat.id ?? null}
      title={opened?.chat.title ?? null}
      initialMessages={opened?.messages ?? []}
      chats={chats}
      configured={configured}
      allowance={allowance}
      workspaceName={workspace.name}
    />
  );
}
