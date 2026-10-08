"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAiChat, renameAiChat } from "@/actions/ai-chat";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import { AI_CHAT_TITLE_MAX } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/services/ai-chat";
import { ASK_PATH, askHref } from "./ask-paths";

/**
 * The person's SpendChat AI chats in this workspace, newest first, with "New
 * chat" on top — the desktop panel beside the sidebar and the phone's sheet
 * both render this. Each row's menu renames or deletes; a deleted open chat leaves you on a
 * new one. The server list is the truth: every change asks the router for it
 * again rather than patching a local copy.
 */
export function ChatList({
  chats,
  onNavigate,
  className,
}: {
  chats: ChatSummary[];
  /** Called when a row or "New chat" is followed — the phone's sheet closes on it. */
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = pathname === ASK_PATH ? searchParams.get("c") : null;
  const profile = searchParams.get("profile");
  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);

  // A new, empty chat is what's open: "New chat" is where you are.
  const onNewChat = pathname === ASK_PATH && !activeId;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="shrink-0 px-3 pb-3">
        {/* Neutral on purpose: starting a chat calls no model, and the
            blue→violet gradient is kept for what does (the send button). */}
        <Link
          href={askHref({ profile })}
          onClick={onNavigate}
          aria-current={onNewChat ? "page" : undefined}
          className={cn(
            "group/new flex h-10 w-full items-center gap-2.5 rounded-xl border px-2.5 text-sm font-medium shadow-xs outline-none",
            "transition-[background-color,border-color,box-shadow,transform] active:scale-[0.99]",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            onNewChat
              ? "border-foreground/15 bg-accent text-accent-foreground"
              : "bg-background text-foreground hover:border-foreground/15 hover:bg-accent/60",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md border bg-background transition-colors",
              onNewChat ? "border-foreground/15" : "group-hover/new:border-foreground/15",
            )}
          >
            <SquarePen className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate">New chat</span>
          {/* `c` opens SpendChat AI on a new chat from anywhere. No keyboard on
              a phone, so no chip there. */}
          <Kbd
            combo={comboFor("nav.ask")}
            className="hidden opacity-60 transition-opacity group-hover/new:opacity-100 md:inline-flex"
          />
        </Link>
      </div>
      <nav aria-label="Chats" className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {chats.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No chats yet. Ask a question and it shows up here.
          </p>
        ) : (
          <>
            <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">Recent</p>
            <ul className="space-y-0.5">
              {chats.map((chat) => {
                const active = chat.id === activeId;
                return (
                  <li key={chat.id} className="group/chat relative">
                    <Link
                      href={askHref({ chatId: chat.id, profile })}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={chat.title}
                      className={cn(
                        "flex h-9 items-center rounded-lg pr-10 pl-3 text-sm outline-none transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring/50",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <span className="min-w-0 truncate">{chat.title}</span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Options for “${chat.title}”`}
                          className={cn(
                            "absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=open]:bg-background/70 data-[state=open]:text-foreground",
                            // Always there on touch screens and on the open
                            // chat; elsewhere with a mouse, on hover or focus.
                            !active &&
                              "md:opacity-0 md:group-focus-within/chat:opacity-100 md:group-hover/chat:opacity-100 md:data-[state=open]:opacity-100",
                          )}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      {/* Sized to its items (one line each), not to the tiny trigger. */}
                      <DropdownMenuContent align="end" className="w-auto min-w-36">
                        <DropdownMenuItem onSelect={() => setRenaming(chat)}>
                          <Pencil />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(chat)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>
      <RenameChatDialog chat={renaming} onClose={() => setRenaming(null)} />
      <DeleteChatDialog
        chat={deleting}
        activeId={activeId}
        profile={profile}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function RenameChatDialog({ chat, onClose }: { chat: ChatSummary | null; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [lastChat, setLastChat] = useState<ChatSummary | null>(null);
  // Prefill on open (state from props, set during render — no effect needed).
  if (chat && chat !== lastChat) {
    setLastChat(chat);
    setTitle(chat.title);
  }

  function save() {
    if (!chat) return;
    const next = title.trim();
    if (!next) return;
    if (next === chat.title) return onClose();
    startTransition(async () => {
      const res = await renameAiChat({ chatId: chat.id, title: next });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={chat !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Only you see your chats.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={AI_CHAT_TITLE_MAX}
            aria-label="Chat name"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteChatDialog({
  chat,
  activeId,
  profile,
  onClose,
}: {
  chat: ChatSummary | null;
  activeId: string | null;
  profile: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!chat) return;
    startTransition(async () => {
      const res = await deleteAiChat(chat.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onClose();
      toast.success("Chat deleted");
      // The open chat is gone: start a new one. Otherwise just drop the row.
      if (chat.id === activeId) router.replace(askHref({ profile }));
      else router.refresh();
    });
  }

  return (
    <AlertDialog open={chat !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>
            “{chat?.title}” and its messages are deleted for good. Your transactions aren’t touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              remove();
            }}
            disabled={pending}
            className={buttonVariants({ variant: "destructive" })}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
