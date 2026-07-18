"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, LogOut, Plus, Trash2, UserPlus } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { usePermissions } from "./permissions";
import {
  addWorkspaceMember,
  cancelWorkspaceInvite,
  removeCollaborator,
  renameWorkspace,
  setInviteAccess,
  setMemberAccess,
} from "@/actions/workspaces";
import type { WorkspaceRole } from "@/db/schema";

/** Editable access value — mirrors the server `AccessGrant` (ids + roles only;
 *  profile names come from the `profiles` prop). */
type AccessValue =
  | { mode: "all"; role: WorkspaceRole }
  | { mode: "profiles"; entries: { profileId: string; role: WorkspaceRole }[] };

type ProfileOption = { id: string; name: string; icon: string | null };
type Collaborator = {
  userId: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  access: AccessValue;
};
type PendingInvite = { email: string; access: AccessValue };

const ROLES: { value: WorkspaceRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
];

function RoleSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as WorkspaceRole)} disabled={disabled}>
      <SelectTrigger className={cn("h-8 w-28", className)} aria-label={ariaLabel ?? "Role"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---- access helpers ----

function profileLabel(p: ProfileOption): string {
  return `${p.icon ? `${p.icon} ` : ""}${p.name}`;
}

/** Short human summary of an access value (for the popover trigger / badges). */
function accessSummary(access: AccessValue, profiles: ProfileOption[]): string {
  if (access.mode === "all") return "All profiles";
  if (access.entries.length === 0) return "No profiles";
  if (access.entries.length === 1) {
    const p = profiles.find((x) => x.id === access.entries[0]!.profileId);
    return p ? profileLabel(p) : "1 profile";
  }
  return `${access.entries.length} profiles`;
}

function accessEqual(a: AccessValue, b: AccessValue): boolean {
  if (a.mode === "all" && b.mode === "all") return a.role === b.role;
  if (a.mode === "profiles" && b.mode === "profiles") {
    if (a.entries.length !== b.entries.length) return false;
    const bByProfile = new Map(b.entries.map((e) => [e.profileId, e.role]));
    return a.entries.every((e) => bByProfile.get(e.profileId) === e.role);
  }
  return false;
}

/** Checkbox list: "All profiles" (one role) or a set of profiles each at its own role. */
function ProfileScopeEditor({
  value,
  onChange,
  profiles,
}: {
  value: AccessValue;
  onChange: (v: AccessValue) => void;
  profiles: ProfileOption[];
}) {
  const isAll = value.mode === "all";
  const entries = value.mode === "profiles" ? value.entries : [];
  const roleOf = (id: string) => entries.find((e) => e.profileId === id)?.role;
  // Role to seed a newly-ticked profile with (carry the current one along).
  const seedRole: WorkspaceRole = isAll ? value.role : (entries[0]?.role ?? "viewer");

  function toggleProfile(id: string, checked: boolean) {
    const next = checked
      ? [...entries.filter((e) => e.profileId !== id), { profileId: id, role: seedRole }]
      : entries.filter((e) => e.profileId !== id);
    onChange({ mode: "profiles", entries: next });
  }

  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent">
        <Checkbox
          checked={isAll}
          onCheckedChange={(c) => c && onChange({ mode: "all", role: seedRole })}
          aria-label="All profiles"
        />
        <span className="flex-1 text-sm font-medium">All profiles</span>
        {isAll && (
          <RoleSelect
            value={value.role}
            onChange={(r) => onChange({ mode: "all", role: r })}
            className="h-7 w-[5.5rem]"
            ariaLabel="Role for all profiles"
          />
        )}
      </label>
      <Separator />
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {profiles.map((p) => {
          const checked = !isAll && roleOf(p.id) !== undefined;
          return (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(c) => toggleProfile(p.id, c === true)}
                aria-label={p.name}
              />
              <span
                className={cn("min-w-0 flex-1 truncate text-sm", isAll && "text-muted-foreground")}
              >
                {profileLabel(p)}
              </span>
              {checked && (
                <RoleSelect
                  value={roleOf(p.id)!}
                  onChange={(r) =>
                    onChange({
                      mode: "profiles",
                      entries: entries.map((e) => (e.profileId === p.id ? { ...e, role: r } : e)),
                    })
                  }
                  className="h-7 w-[5.5rem]"
                  ariaLabel={`Role for ${p.name}`}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Popover used in the invite form — a controlled scope picker, no Save (the
 *  form's Add button commits). */
function AccessPicker({
  value,
  onChange,
  profiles,
  className,
}: {
  value: AccessValue;
  onChange: (v: AccessValue) => void;
  profiles: ProfileOption[];
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 justify-between gap-2 font-normal", className)}
        >
          <span className="truncate">{accessSummary(value, profiles)}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" closeOnOutsideClick className="w-72">
        <ProfileScopeEditor value={value} onChange={onChange} profiles={profiles} />
      </PopoverContent>
    </Popover>
  );
}

/** Popover used on a person/invite row — edits a draft and commits on Save. */
function AccessEditor({
  current,
  profiles,
  pending,
  onSave,
}: {
  current: AccessValue;
  profiles: ProfileOption[];
  pending: boolean;
  onSave: (v: AccessValue) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<AccessValue>(current);
  const changed = !accessEqual(draft, current);
  const invalid = draft.mode === "profiles" && draft.entries.length === 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(current); // seed the draft fresh each time it opens
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          className="h-8 max-w-[10rem] justify-between gap-1.5 font-normal"
        >
          <span className="truncate">{accessSummary(current, profiles)}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" closeOnOutsideClick className="w-72">
        <ProfileScopeEditor value={draft} onChange={setDraft} profiles={profiles} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !changed || invalid}
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Read-only access display (owner, and non-admin members). */
function AccessBadges({ access, profiles }: { access: AccessValue; profiles: ProfileOption[] }) {
  if (access.mode === "all") {
    return (
      <Badge variant="outline" className="capitalize">
        {access.role}
      </Badge>
    );
  }
  return <Badge variant="outline">{accessSummary(access, profiles)}</Badge>;
}

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
  profiles,
}: {
  workspace: { id: string; name: string; role: WorkspaceRole | null };
  currentUserId: string;
  collaborators: Collaborator[];
  invites: PendingInvite[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { canWrite } = usePermissions();
  const isAdmin = workspace.role === "admin";
  const isMember = workspace.role !== null;

  const [name, setName] = React.useState(workspace.name);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Invite form state.
  const [email, setEmail] = React.useState("");
  const [draftAccess, setDraftAccess] = React.useState<AccessValue>({ mode: "all", role: "viewer" });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (okMessage) toast.success(okMessage);
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === workspace.name) return;
    run(() => renameWorkspace(workspace.id, name.trim()), "Workspace renamed");
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
        setDraftAccess({ mode: "all", role: "viewer" });
        router.refresh();
      } else {
        toast.error(res.error);
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
            <form onSubmit={handleRename} className="flex max-w-md items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="workspace-rename">Name</Label>
                <Input
                  id="workspace-rename"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                disabled={pending || !name.trim() || name.trim() === workspace.name}
              >
                Rename
              </Button>
            </form>
          ) : (
            <p className="text-sm">
              <span className="text-muted-foreground">Name: </span>
              {workspace.name}
            </p>
          )}
        </CardContent>
      </Card>

      {isMember && (
        <Card>
          <CardHeader>
            <CardTitle>People with access</CardTitle>
            <CardDescription>
              Who can open this workspace, and what they can reach. Give access to every profile,
              or pick specific profiles — each at its own role (viewer reads, editor writes
              transactions, admin manages everything).
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
                    profiles={profiles}
                    className="w-full lg:w-48"
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
                      profiles={profiles}
                      pending={pending}
                      onSave={(v) =>
                        run(() => setMemberAccess(workspace.id, c.userId, v), "Access updated")
                      }
                    />
                  ) : (
                    <AccessBadges access={c.access} profiles={profiles} />
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
