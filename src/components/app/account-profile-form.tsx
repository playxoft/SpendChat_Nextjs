"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAccountName } from "@/actions/settings";

/** Safety cap mirrored from the upload route (the resize keeps us well under it). */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Center-crop to a square and shrink to ≤`size`px, re-encoded as WebP. Keeps the
 * upload tiny and gives every avatar the same shape, so the server just stores
 * the bytes. Falls back to the original file if the browser can't decode it.
 */
async function resizeToSquare(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const min = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.drawImage(bitmap, (bitmap.width - min) / 2, (bitmap.height - min) / 2, min, min, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
        "image/webp",
        0.9,
      ),
    );
  } finally {
    bitmap.close?.();
  }
}

/**
 * Account identity: avatar (stored in R2 via `POST /api/account/avatar`) and the
 * user's display name (`updateAccountName`). Client-side because the avatar is
 * resized in a canvas before upload.
 */
export function AccountProfileForm({
  initialName,
  initialImage,
  email,
}: {
  initialName: string | null;
  initialImage: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState(initialImage);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(initialName ?? "");
  const [savedName, setSavedName] = useState(initialName ?? "");
  const [saving, startSave] = useTransition();

  // Re-baseline if the server value changes underneath (e.g. after a refresh).
  const [baseName, setBaseName] = useState(initialName ?? "");
  if (baseName !== (initialName ?? "")) {
    setBaseName(initialName ?? "");
    setSavedName(initialName ?? "");
    setName(initialName ?? "");
  }

  const initials = (name.trim()[0] ?? email?.[0] ?? "?").toUpperCase();
  const nameDirty = name.trim().length > 0 && name.trim() !== savedName.trim();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }

    setBusy(true);
    try {
      let body: Blob;
      try {
        body = await resizeToSquare(file);
      } catch {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error("That image is too large (max 2 MB).");
          return;
        }
        body = file;
      }
      const form = new FormData();
      form.append("file", body, "avatar.webp");
      const res = await fetch("/api/account/avatar", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Couldn't upload that image.");
        return;
      }
      setImage(data.url);
      toast.success("Profile picture updated");
      router.refresh();
    } catch {
      toast.error("Couldn't upload that image.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Couldn't remove the picture.");
        return;
      }
      setImage(null);
      toast.success("Profile picture removed");
      router.refresh();
    } catch {
      toast.error("Couldn't remove the picture.");
    } finally {
      setBusy(false);
    }
  }

  function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!nameDirty) return;
    const next = name.trim();
    startSave(async () => {
      const res = await updateAccountName(next);
      if (res.ok) {
        setSavedName(res.name);
        setName(res.name);
        toast.success("Name updated");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {image ? <AvatarImage src={image} alt="Profile picture" /> : null}
          <AvatarFallback className="text-xl">{initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onPick}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {image ? "Change" : "Upload"}
            </Button>
            {image && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
                <Trash2 className="size-3.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, or WebP — we&apos;ll crop it to a square.
          </p>
        </div>
      </div>

      <form onSubmit={onSaveName} className="space-y-1.5">
        <Label htmlFor="account-name">Name</Label>
        <div className="flex gap-2">
          <Input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="Your name"
            autoComplete="name"
            className="h-10 max-w-sm"
          />
          <Button type="submit" className="h-10" disabled={!nameDirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
