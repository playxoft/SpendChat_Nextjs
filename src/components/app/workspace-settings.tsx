"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Plus, Trash2, UserPlus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { cn } from "@/lib/utils";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { AccessBadge, AccessEditor, AccessPicker } from "./member-access-editor";
import { usePermissions } from "./permissions";
import { usePlan } from "./upgrade-dialog";
import { UsagePanel, type UsageData } from "./usage-panel";
import {
  addWorkspaceMember,
  cancelWorkspaceInvite,
  removeCollaborator,
  setInviteAccess,
  setMemberAccess,
  updateWorkspace,
} from "@/actions/workspaces";
import { DEFAULT_WORKSPACE_ICON, WORKSPACE_NAME_MAX } from "@/lib/validation";
import type { AccessValue, NamedOption } from "@/lib/member-access";
import type { WorkspaceRole } from "@/db/schema";

type Collaborator = {
  userId: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  access: AccessValue;
};
type PendingInvite = { email: string; access: AccessValue };

/** Wraps a trigger in a destructive confirmation dialog before running `onConfirm`. */
function ConfirmAction({
  trigger,
  title,
  body,
  confirmLabel,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WorkspaceSettings({
  workspace,
  currentUserId,
  collaborators,
  invites,
  spaces,
  profiles,
  usage,
}: {
  workspace: { id: string; name: string; icon: string | null; role: WorkspaceRole | null };
  currentUserId: string;
  collaborators: Collaborator[];
  invites: PendingInvite[];
  /** The workspace's spaces, in sidebar order (every space, for admins). */
  spaces: NamedOption[];
  profiles: NamedOption[];
  /** `getUsage(workspaceId)` — the plan & usage card, shown to everyone. */
  usage: UsageData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { canWrite } = usePermissions();
  const { reportFailure } = usePlan();
  const isAdmin = workspace.role === "admin";
  const isMember = workspace.role !== null;

  const [name, setName] = React.useState(workspace.name);
  const [icon, setIcon] = React.useState(workspace.icon ?? DEFAULT_WORKSPACE_ICON);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Invite form state. A new person starts as a viewer in every space.
  const freshAccess = (): AccessValue => ({
    mode: "all",
    role: "viewer",
    spaceIds: spaces.map((s) => s.id),
  });
  const [email, setEmail] = React.useState("");
  const [draftAccess, setDraftAccess] = React.useState<AccessValue>(freshAccess);

  function run(
    fn: () => Promise<{ ok: boolean; error?: string; code?: string; details?: unknown }>,
    okMessage?: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (okMessage) toast.success(okMessage);
        router.refresh();
      } else {
        // A plan limit (member cap, per-profile access on Free) opens the
        // upgrade dialog; anything else toasts.
        reportFailure(res);
      }
    });
  }

  const currentIcon = workspace.icon ?? DEFAULT_WORKSPACE_ICON;
  const detailsChanged = name.trim() !== workspace.name || icon !== currentIcon;

  function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !detailsChanged) return;
    run(() => updateWorkspace(workspace.id, { name: name.trim(), icon }), "Workspace updated");
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    if (draftAccess.mode === "profiles" && draftAccess.entries.length === 0) {
      toast.error("Pick at least one profile");
      return;
    }
    startTransition(async () => {
      const res = await addWorkspaceMember(workspace.id, {
        email: email.trim(),
        access: draftAccess,
      });
      if (res.ok) {
        toast.success(
          res.status === "added"
            ? "Access granted — they already have an account"
            : "Invite sent — access unlocks when they sign up",
        );
        setEmail("");
        setDraftAccess(freshAccess());
        router.refresh();
      } else {
        reportFailure(res);
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            {isMember
              ? `You're ${workspace.role === "admin" ? "an admin" : `a ${workspace.role}`} of this workspace.`
              : "You have access to shared profiles in this workspace."}
          </CardDescription>
          {canWrite && (
            <CardAction>
              <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Create workspace
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {isAdmin ? (
            <form onSubmit={handleSaveDetails} className="flex max-w-md items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="workspace-rename">Name & icon</Label>
                <div className="flex items-center gap-2">
                  <EmojiPicker
                    onSelect={setIcon}
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Pick an icon"
                      >
                        <span className="text-base">{icon}</span>
                      </Button>
                    }
                  />
                  <Input
                    id="workspace-rename"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={WORKSPACE_NAME_MAX}
                    className="flex-1"
                  />
                </div>
              </div>
              <Button type="submit" variant="secondary" disabled={pending || !name.trim() || !detailsChanged}>
                Save
              </Button>
            </form>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <span aria-hidden className="text-base">
                {workspace.icon ?? DEFAULT_WORKSPACE_ICON}
              </span>
              {workspace.name}
            </p>
          )}
        </CardContent>
      </Card>

      <UsagePanel usage={usage} />

      {isMember && (
        <Card>
          <CardHeader>
            <CardTitle>People with access</CardTitle>
            <CardDescription>
              Who can open this workspace, and what they can reach. Viewers read, editors read and
              write, admins manage everything and see every space. Give viewers and editors the
              spaces they need — on Plus and Pro you can also share single profiles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin && (
              <form
                onSubmit={handleInvite}
                className="space-y-2 rounded-lg border bg-muted/30 p-3 lg:flex lg:items-end lg:gap-2 lg:space-y-0"
              >
                <div className="min-w-0 space-y-1.5 lg:flex-1">
                  <Label htmlFor="invite-email">Add someone by email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    maxLength={100}
                    className="h-8"
                  />
                </div>
                <div className="min-w-0 space-y-1.5 lg:flex-none lg:shrink-0">
                  <Label>Access to</Label>
                  <AccessPicker
                    value={draftAccess}
                    onChange={setDraftAccess}
                    spaces={spaces}
                    profiles={profiles}
                    className="w-full lg:w-52"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending}
                  className="w-full lg:w-auto lg:shrink-0"
                >
                  <UserPlus className="size-4" />
                  Add
                </Button>
              </form>
            )}

            <ul className="divide-y">
              {collaborators.map((c) => (
                <li key={c.userId} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.name ?? c.email ?? c.userId}
                      {c.userId === currentUserId && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </p>
                    {c.email && c.name && (
                      <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    )}
                  </div>
                  {c.isOwner && <Badge variant="secondary">Owner</Badge>}
                  {isAdmin && !c.isOwner ? (
                    <AccessEditor
                      current={c.access}
                      spaces={spaces}
                      profiles={profiles}
                      pending={pending}
                      onSave={(v) =>
                        run(() => setMemberAccess(workspace.id, c.userId, v), "Access updated")
                      }
                    />
                  ) : (
                    <AccessBadge access={c.access} spaces={spaces} profiles={profiles} />
                  )}
                  {/* Only admins can remove people — including themselves (never the owner). */}
                  {isAdmin && !c.isOwner && (
                    <ConfirmAction
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={
                            c.userId === currentUserId
                              ? "Leave workspace"
                              : `Remove ${c.name ?? c.email ?? "person"}`
                          }
                          disabled={pending}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      }
                      title={c.userId === currentUserId ? "Leave this workspace?" : "Remove this person?"}
                      body={
                        c.userId === currentUserId
                          ? "You'll lose access to this workspace until someone re-invites you."
                          : `${c.name ?? c.email ?? "This person"} will lose access to this workspace. You can re-add them later.`
                      }
                      confirmLabel={c.userId === currentUserId ? "Leave" : "Remove"}
                      onConfirm={() =>
                        run(
                          () => removeCollaborator(workspace.id, c.userId),
                          c.userId === currentUserId ? "You left the workspace" : "Person removed",
                        )
                      }
                    />
                  )}
                  {/* A non-admin member can only leave on their own — never delete anyone. */}
                  {!isAdmin && !c.isOwner && c.userId === currentUserId && (
                    <ConfirmAction
                      trigger={
                        <Button variant="outline" size="sm" disabled={pending}>
                          <LogOut className="size-4" />
                          Leave workspace
                        </Button>
                      }
                      title="Leave this workspace?"
                      body="You'll lose access to this workspace until someone re-invites you."
                      confirmLabel="Leave"
                      onConfirm={() =>
                        run(
                          () => removeCollaborator(workspace.id, c.userId),
                          "You left the workspace",
                        )
                      }
                    />
                  )}
                </li>
              ))}
            </ul>

            {isAdmin && invites.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Pending invites</p>
                <ul className="divide-y">
                  {invites.map((i) => (
                    <li key={i.email} className="flex flex-wrap items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{i.email}</p>
                        <p className="text-xs text-muted-foreground">joins on sign-up</p>
                      </div>
                      <AccessEditor
                        current={i.access}
                        spaces={spaces}
                        profiles={profiles}
                        pending={pending}
                        onSave={(v) =>
                          run(() => setInviteAccess(workspace.id, i.email, v), "Invite updated")
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Cancel invite for ${i.email}`}
                        disabled={pending}
                        onClick={() =>
                          run(() => cancelWorkspaceInvite(workspace.id, i.email), "Invite cancelled")
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
