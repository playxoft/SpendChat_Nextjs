import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "spendchat";
import { Download, FolderInput, Pencil, Share2, Trash2 } from "lucide-react";

// Radix's ContextMenu root is uncontrolled by design — it has no `open` or
// `defaultOpen`, and only a real right-click opens it — so a static card can
// only show the surfaces the menu is attached to. The menu markup below is the
// live definition; it opens on right-click in a running design.
const FILES = [
  { icon: "📄", name: "October-rent-receipt.pdf", meta: "184 KB · 1 Oct" },
  { icon: "🧾", name: "Big-Bazaar-14-Oct.jpg", meta: "1.2 MB · 14 Oct" },
  { icon: "✈️", name: "IndiGo-6E-274.pdf", meta: "96 KB · 5 Oct" },
];

export function VaultItems() {
  return (
    <div className="grid w-72 gap-2">
      <p className="text-xs text-muted-foreground">
        Right-click any file for its actions.
      </p>
      {FILES.map((f) => (
        <ContextMenu key={f.name} modal={false}>
          <ContextMenuTrigger asChild>
            <div className="flex cursor-default items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/40">
              <span className="text-lg">{f.icon}</span>
              <div className="min-w-0">
                <div className="truncate font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">{f.meta}</div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuLabel>File</ContextMenuLabel>
            <ContextMenuItem>
              <Pencil />
              Rename
            </ContextMenuItem>
            <ContextMenuItem>
              <FolderInput />
              Move to folder
            </ContextMenuItem>
            <ContextMenuItem>
              <Share2 />
              Share link
            </ContextMenuItem>
            <ContextMenuItem>
              <Download />
              Download
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive">
              <Trash2 />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  );
}
