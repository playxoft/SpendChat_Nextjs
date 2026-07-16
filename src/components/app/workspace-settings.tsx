"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import {
  addWorkspaceMember,
  cancelWorkspaceInvite,
  removeProfileAccess,
  removeWorkspaceMember,
  renameWorkspace,
  updateWorkspaceMemberRole,
} from "@/actions/workspaces";
import type { WorkspaceRole } from "@/db/schema";

const ROLES: { value: WorkspaceRole; label: string; hint: string }[] = [
  { value: "viewer", label: "Viewer", hint: "can view" },
  { value: "editor", label: "Editor", hint: "can add & edit transactions" },
  { value: "admin", label: "Admin", hint: "can manage everything" },
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

export function WorkspaceSettings({
  workspace,
  currentUserId,
  members,
  invites,
  grants,
  profiles,
}: {
  workspace: { id: string; name: string; role: WorkspaceRole | null };
  currentUserId: string;
  members: {
    userId: string;
    role: WorkspaceRole;
    name: string | null;
    email: string | null;
    isOwner: boolean;
  }[];
  invites: { id: string; email: string; role: WorkspaceRole; profileName: string | null }[];
  grants: {
    profileId: string;
    profileName: string;
    userId: string;
    role: WorkspaceRole;
    name: string | null;
    email: string | null;
  }[];
  profiles: { id: string; name: string; icon: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isAdmin = workspace.role === "admin";
  const isMember = workspace.role !== null;

  const [name, setName] = React.useState(workspace.name);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Invite form state.
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<WorkspaceRole>("viewer");
  const [scope, setScope] = React.useState<string>("workspace"); // "workspace" | profile id

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
    startTransition(async () => {
      const res = await addWorkspaceMember(workspace.id, {
        email: email.trim(),
        role,
        profileId: scope === "workspace" ? null : scope,
      });
      if (res.ok) {
        toast.success(
          res.status === "added"
            ? "Access granted — they already have an account"
            : "Invite sent — access unlocks when they sign up",
        );
        setEmail("");
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
          <CardAction>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create workspace
            </Button>
          </CardAction>
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
                  maxLength={60}
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
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Who can open this workspace, and what they can do. Viewers read, editors
              write transactions, admins manage everything.
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
                    className="h-8"
                  />
                </div>
                {/* On phones the two selects share a row; on desktop this wrapper
                    collapses (contents) so all fields flow inline. */}
                <div className="flex gap-2 lg:contents">
                  <div className="min-w-0 flex-1 space-y-1.5 lg:flex-none lg:shrink-0">
                    <Label>Access to</Label>
                    <Select value={scope} onValueChange={setScope}>
                      <SelectTrigger className="h-8 w-full lg:w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="workspace">All profiles</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.icon ? `${p.icon} ` : ""}
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5 lg:flex-none lg:shrink-0">
                    <Label>Role</Label>
                    <RoleSelect
                      value={role}
                      onChange={setRole}
                      ariaLabel="Invite role"
                      className="w-full lg:w-28"
                    />
                  </div>
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
              {members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.name ?? m.email ?? m.userId}
                      {m.userId === currentUserId && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </p>
                    {m.email && m.name && (
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    )}
                  </div>
                  {m.isOwner && <Badge variant="secondary">Owner</Badge>}
                  {isAdmin && !m.isOwner ? (
                    <RoleSelect
                      value={m.role}
                      onChange={(r) =>
                        run(
                          () => updateWorkspaceMemberRole(workspace.id, m.userId, r),
                          "Role updated",
                        )
                      }
                      disabled={pending}
                      ariaLabel={`Role for ${m.name ?? m.email ?? "member"}`}
                    />
                  ) : (
                    <Badge variant="outline" className="capitalize">
                      {m.role}
                    </Badge>
                  )}
                  {!m.isOwner && (isAdmin || m.userId === currentUserId) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        m.userId === currentUserId ? "Leave workspace" : "Remove member"
                      }
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => removeWorkspaceMember(workspace.id, m.userId),
                          m.userId === currentUserId ? "You left the workspace" : "Member removed",
                        )
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {isAdmin && invites.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Pending invites</p>
                <ul className="divide-y">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{i.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.profileName ? `${i.profileName} only` : "All profiles"} ·{" "}
                          <span className="capitalize">{i.role}</span> · joins on sign-up
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Cancel invite for ${i.email}`}
                        disabled={pending}
                        onClick={() =>
                          run(() => cancelWorkspaceInvite(i.id), "Invite cancelled")
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

      {isAdmin && grants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Profile sharing</CardTitle>
            <CardDescription>
              People with access to individual profiles (instead of the whole
              workspace). Grant access from the Members form above by picking a
              profile under “Access to”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {grants.map((g) => (
                <li
                  key={`${g.profileId}:${g.userId}`}
                  className="flex flex-wrap items-center gap-2 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {g.name ?? g.email ?? g.userId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {g.profileName} · <span className="capitalize">{g.role}</span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Revoke access"
                    disabled={pending}
                    onClick={() =>
                      run(() => removeProfileAccess(g.profileId, g.userId), "Access revoked")
                    }
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
