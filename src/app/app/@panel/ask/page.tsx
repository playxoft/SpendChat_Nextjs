import { getAppContext } from "@/lib/auth";
import { listChatsForRender } from "@/services/ai-chat";
import { AskPanel } from "@/components/app/ask/ask-panel";

/**
 * Ask's chat list, in the column beside the sidebar. The page itself reads the
 * same list for its phone sheet in the same render, so the read is memoized
 * (`listChatsForRender`). Only the asker's own chats in the current workspace.
 */
export default async function AskPanelSlot() {
  const { user, workspace } = await getAppContext();
  const chats = await listChatsForRender(user.id, workspace.id);
  return <AskPanel chats={chats} />;
}
