import type { ChatSummary } from "@/services/ai-chat";
import { ChatList } from "./chat-list";

/**
 * Ask's chat list as a second column, flush against the sidebar's right edge
 * (Notion-style) and as tall as the window, staying put while the
 * conversation scrolls. (It only shows from `lg`, where there's no top bar.)
 *
 * It's part of the Ask *page*, not a layout or a parallel-route slot, on
 * purpose:
 *  - A slot beside the sidebar has to match every `/app` URL, or Next keeps
 *    its last segment on a client-side navigation and re-requests that old Ask
 *    URL on every later refresh (`reuseActiveSegmentInDefaultSlot`).
 *  - An `ask/layout.tsx` isn't re-rendered when only `?c=` changes, so the list
 *    would go stale, and it sits outside `ask/loading.tsx`.
 * In the page, the list is read with the chat and refreshed with it.
 *
 * Desktop only, from `lg` up — below that, beside a 240px sidebar it would
 * squeeze the conversation to a strip. Smaller screens get the same list in a
 * sheet from the page's header (`AskHeader`).
 */
export function AskPanel({ chats }: { chats: ChatSummary[] }) {
  return (
    <aside
      aria-label="Your chats"
      className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-background pt-3 lg:flex print:hidden"
    >
      <ChatList chats={chats} className="flex-1" />
    </aside>
  );
}
