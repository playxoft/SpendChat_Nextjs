"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createFileShare, listFileShares, revokeFileShare } from "@/actions/files";
import { sharePath, type FileShareDTO } from "@/lib/files";
import { formatVaultDate, type VaultTarget } from "./files-views";

/**
 * Share a file or folder by link. A link is a bearer capability: anyone who
 * has the URL can open the share page; "view only" hides downloads. Links are
 * listed here and revocable — revoking kills the URL immediately.
 */
export function ShareVaultItemDialog({
  target,
  locale,
  onOpenChange,
}: {
  target: VaultTarget | null;
  locale: string;
  onOpenChange: (open: boolean) => void;
}) {
  // Transaction files aren't shareable (no menu offers it); type-guard anyway.
  const shareable = target && target.kind !== "txn" ? target : null;
  return (
    <Dialog open={shareable !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {shareable ? (
          <ShareContent
            key={shareable.kind === "file" ? shareable.file.id : shareable.folder.id}
            target={shareable}
            locale={locale}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "7", label: "Expires in 7 days" },
  { value: "30", label: "Expires in 30 days" },
  { value: "90", label: "Expires in 90 days" },
] as const;

function ShareContent({
  target,
  locale,
}: {
  target: Exclude<VaultTarget, { kind: "txn" }>;
  locale: string;
}) {
  const isFile = target.kind === "file";
  const id = isFile ? target.file.id : target.folder.id;
  const name = isFile ? target.file.name : target.folder.name;

  const [shares, setShares] = useState<FileShareDTO[] | null>(null);
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiry, setExpiry] = useState<string>("never");
  const [creating, startCreating] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listFileShares(isFile ? { fileId: id } : { folderId: id });
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setShares([]);
        return;
      }
      setShares(res.shares);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isFile]);

  const shareUrl = (token: string) =>
    `${typeof window === "undefined" ? "" : window.location.origin}${sharePath(token)}`;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — copy it from the address bar after opening");
    }
  };

  const create = () => {
    startCreating(async () => {
      const res = await createFileShare({
        ...(isFile ? { fileId: id } : { folderId: id }),
        allowDownload,
        expiresInDays: expiry === "never" ? null : Number(expiry),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setShares((prev) => [res.share, ...(prev ?? [])]);
      void copy(res.share.token);
    });
  };

  const revoke = async (share: FileShareDTO) => {
    const res = await revokeFileShare(share.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setShares((prev) => (prev ?? []).filter((s) => s.id !== share.id));
    toast.success("Link revoked");
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Share “{name}”</DialogTitle>
        <DialogDescription>
          Anyone with a link can view {isFile ? "this file" : "this folder and everything in it"} —
          no sign-in needed. Revoke a link to cut off access.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>New link</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={create} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            Create link
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allowDownload}
            onCheckedChange={(v) => setAllowDownload(v === true)}
          />
          Allow downloads (uncheck for view-only)
        </label>

        <Separator />

        {shares === null ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : shares.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No active links. Create one to share.
          </p>
        ) : (
          <ul className="space-y-2">
            {shares.map((share) => (
              <li key={share.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{shareUrl(share.token)}</div>
                  <div className="text-xs text-muted-foreground">
                    {share.allowDownload ? "View & download" : "View only"}
                    {" · "}
                    {share.expiresAt
                      ? `expires ${formatVaultDate(share.expiresAt, locale)}`
                      : "never expires"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => copy(share.token)}
                  aria-label="Copy link"
                  title="Copy link"
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => revoke(share)}
                  aria-label="Revoke link"
                  title="Revoke link"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
