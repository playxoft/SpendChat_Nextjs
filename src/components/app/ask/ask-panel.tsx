"use client";

import { usePathname } from "next/navigation";
import type { ChatSummary } from "@/services/ai-chat";
import { ChatList } from "./chat-list";
import { ASK_PATH } from "./ask-paths";

/**
 * Ask's chat list as a second column, flush against the sidebar's right edge
 * (Notion-style), full height beside the page. Rendered by the app layout's
 * `@panel` slot, which only has a page for `/app/ask`.
 *
 * The pathname check is load-bearing: on a client-side navigation to a route
 * the slot has no page for, Next keeps the slot's *last* page mounted (a slot
 * remembers its active state on soft navigation). Without the check, leaving
 * Ask for the tracker would bring this column along.
 *
 * Desktop only, from `lg` up — below that, beside a 240px sidebar it would
 * squeeze the conversation to a strip. Smaller screens get the same list in a
 * sheet from the page's header (`AskHeader`).
 */
export function AskPanel({ chats }: { chats: ChatSummary[] }) {
  const pathname = usePathname();
  if (pathname !== ASK_PATH) return null;
  return (
    <aside
      aria-label="Your chats"
      className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-background lg:flex print:hidden"
    >
      <div className="flex h-14 shrink-0 items-center px-5">
        <p className="text-sm font-semibold">Chats</p>
      </div>
      <ChatList chats={chats} className="flex-1" />
    </aside>
  );
}
