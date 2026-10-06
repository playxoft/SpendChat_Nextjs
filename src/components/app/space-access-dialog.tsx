"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { getSpaceAccess, setProfileOverride, setSpaceMember } from "@/actions/spaces";
import { profileAccessLock } from "@/lib/add-limits";
import { cn } from "@/lib/utils";
import { accessLevelForRole } from "@/lib/rbac";
import { UpgradeHint, usePlan } from "./upgrade-dialog";
import { LimitLock } from "./limit-lock";

/**
 * A space's "Members & access" dialog (workspace admins). Two layers, matching
 * how access resolves on the server:
 *
 *  1. **Who's in the space** — each non-admin member is in or out, at Read
 *     (viewer) or Read + write (editor). Admins see every space and aren't
 *     editable here.
 *  2. **Per-profile overrides** (Plus/Pro) — for one member on one profile:
 *     No access / Read / Read + write, which wins over the space role in either
 *     direction. "Default" clears it. On Free the matrix is shown but locked;
 *     existing overrides keep working.
 */

type SpaceRole = "viewer" | "editor";
type AccessLevel = "none" | "read" | "write";

/** The shape `getSpaceAccess` returns (kept structural — services are server-only). */
type SpaceAccessData = {
  space: { id: string; name: string; icon: string | null; workspaceId: string };
  members: {
    userId: string;
    name: string | null;
    email: string | null;
    workspaceRole: "viewer" | "editor" | "admin";
    spaceRole: SpaceRole | null;
    isOwner: boolean;
  }[];
  profiles: { id: string; name: string; icon: string | null }[];
  overrides: { profileId: string; userId: string; access: AccessLevel }[];
  canEditOverrides: boolean;
};

const SPACE_ROLE_LABEL: Record<SpaceRole, string> = { viewer: "Read", editor: "Read + write" };
const ACCESS_LABEL: Record<AccessLevel, string> = {
  none: "No access",
  read: "Read",
  write: "Read + write",
};
const DEFAULT = "default";
/** Narrowest to widest, for the narrow-only choices on plans without per-profile access. */
const LEVEL_RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2 };

function personLabel(m: { name: string | null; email: string | null; userId: string }): string {
  return m.name ?? m.email ?? "Someone";
}

export function SpaceAccessDialog({
  spaceId,
  spaceName,
  open,
  onOpenChange,
}: {
  spaceId: string;
  spaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { plan, reportFailure } = usePlan();
  const [data, setData] = React.useState<SpaceAccessData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Re-read what the server holds — after every change, so the dialog shows the truth. */
  async function load() {
    const res = await getSpaceAccess(spaceId);
    if (res.ok) {
      setData(res.access);
      setError(null);
    } else {
      setError(res.error);
    }
  }

  // Fetch fresh each time it opens.
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setData(null);
      setError(null);
    }
  }
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getSpaceAccess(spaceId).then((res) => {
      if (cancelled) return;
      if (res.ok) setData(res.access);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, spaceId]);

  function setMember(userId: string, role: SpaceRole | null) {
    if (!data) return;
    // Optimistic: flip the row now, then re-read what the server holds (taking
    // someone out also clears their overrides on this space's profiles).
    setData({
      ...data,
      members: data.members.map((m) => (m.userId === userId ? { ...m, spaceRole: role } : m)),
      overrides: role === null ? data.overrides.filter((o) => o.userId !== userId) : data.overrides,
    });
    startTransition(async () => {
      const res = await setSpaceMember(spaceId, { userId, role });
      if (!res.ok) reportFailure(res);
      await load();
    });
  }

  function setOverride(profileId: string, userId: string, access: AccessLevel | null) {
    if (!data) return;
    const rest = data.overrides.filter((o) => !(o.profileId === profileId && o.userId === userId));
    setData({
      ...data,
      overrides: access === null ? rest : [...rest, { profileId, userId, access }],
    });
    startTransition(async () => {
      const res = await setProfileOverride(profileId, { userId, access });
      if (!res.ok) reportFailure(res);
      await load();
    });
  }

  const nonAdmins = data?.members.filter((m) => m.workspaceRole !== "admin") ?? [];
  const admins = data?.members.filter((m) => m.workspaceRole === "admin") ?? [];
  // The matrix: people in the space, plus anyone with an override here (an
  // override can open a profile to someone outside the space).
  const withOverride = new Set(data?.overrides.map((o) => o.userId) ?? []);
  const matrixPeople = nonAdmins.filter((m) => m.spaceRole !== null || withOverride.has(m.userId));
  const canEdit = data?.canEditOverrides ?? false;
  const accessLock = data && !canEdit ? profileAccessLock(plan) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Members & access</DialogTitle>
          <DialogDescription>
            Who can see the {spaceName} space. Admins always see every space.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {error ?? <Loader2 aria-label="Loading" className="size-5 animate-spin" />}
          </div>
        ) : (
          <div className="space-y-5" aria-busy={pending}>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">People in this space</h3>
              <ul className="divide-y rounded-lg border">
                {admins.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                    <PersonName person={m} />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {m.isOwner ? "Owner" : "Admin"} — sees everything
                    </span>
                  </li>
                ))}
                {nonAdmins.map((m) => {
                  const inSpace = m.spaceRole !== null;
                  const switchId = `space-member-${m.userId}`;
                  return (
                    <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                      <PersonName person={m} />
                      <div className="flex shrink-0 items-center gap-2">
                        <Label htmlFor={switchId} className="text-xs font-normal text-muted-foreground">
                          In this space
                        </Label>
                        <Switch
                          id={switchId}
                          aria-label={`${personLabel(m)} is in this space`}
                          checked={inSpace}
                          disabled={pending}
                          onCheckedChange={(on) => setMember(m.userId, on ? "viewer" : null)}
                        />
                        <Select
                          value={m.spaceRole ?? "viewer"}
                          disabled={!inSpace || pending}
                          onValueChange={(v) => setMember(m.userId, v as SpaceRole)}
                        >
                          <SelectTrigger
                            className="h-8 w-32"
                            aria-label={`${personLabel(m)}'s role in this space`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">{SPACE_ROLE_LABEL.viewer}</SelectItem>
                            <SelectItem value="editor">{SPACE_ROLE_LABEL.editor}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </li>
                  );
                })}
                {nonAdmins.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    Everyone else in this workspace is an admin. Add people in Workspace settings.
                  </li>
                )}
              </ul>
              <p className="text-xs text-muted-foreground">
                Taking someone out of the space also clears their per-profile settings here.
              </p>
            </section>

            <Separator />

            <section className="space-y-2">
              <div>
                <h3 className="flex items-center gap-1 text-sm font-medium">
                  Per-profile access
                  <LimitLock lock={accessLock} side="right" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Change access for one profile — this wins over the space role. Default follows
                  the space.
                </p>
              </div>
              {accessLock && (
                <UpgradeHint
                  info={accessLock.info}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                >
                  Per-profile access is on Plus and Pro. Settings made earlier keep working, and
                  you can still narrow them.
                </UpgradeHint>
              )}
              {data.profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">This space has no profiles yet.</p>
              ) : matrixPeople.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody besides admins is in this space yet.
                </p>
              ) : (
                <div className={cn("space-y-3", !canEdit && "opacity-70")}>
                  {matrixPeople.map((m) => (
                    <fieldset key={m.userId} className="rounded-lg border p-3">
                      <legend className="px-1 text-sm font-medium">{personLabel(m)}</legend>
                      <ul className="space-y-1.5">
                        {data.profiles.map((p) => {
                          const override = data.overrides.find(
                            (o) => o.profileId === p.id && o.userId === m.userId,
                          );
                          const spaceDefault = m.spaceRole
                            ? SPACE_ROLE_LABEL[m.spaceRole]
                            : "No access";
                          // Without per-profile access (Free) an existing
                          // override can still be narrowed — to No access, or
                          // back to the space default when that's no wider —
                          // so a downgrade never leaves access stuck open.
                          const current = override?.access ?? null;
                          const defaultRank = LEVEL_RANK[accessLevelForRole(m.spaceRole)];
                          const narrowOnly = !canEdit;
                          const options: { value: string; label: string }[] = [
                            { value: DEFAULT, label: `Default (${spaceDefault})` },
                            { value: "none", label: ACCESS_LABEL.none },
                            { value: "read", label: ACCESS_LABEL.read },
                            { value: "write", label: ACCESS_LABEL.write },
                          ].filter((o) => {
                            if (!narrowOnly || current === null) return true;
                            if (o.value === current || o.value === "none") return true;
                            if (o.value === DEFAULT) return defaultRank <= LEVEL_RANK[current];
                            return LEVEL_RANK[o.value as AccessLevel] <= LEVEL_RANK[current];
                          });
                          return (
                            <li key={p.id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate text-sm">
                                <span aria-hidden className="mr-1.5">{p.icon ?? "👤"}</span>
                                {p.name}
                              </span>
                              <Select
                                value={override?.access ?? DEFAULT}
                                disabled={pending || (narrowOnly && current === null)}
                                onValueChange={(v) =>
                                  setOverride(p.id, m.userId, v === DEFAULT ? null : (v as AccessLevel))
                                }
                              >
                                <SelectTrigger
                                  className="h-8 w-40 shrink-0"
                                  aria-label={`${personLabel(m)}'s access to ${p.name}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PersonName({
  person,
}: {
  person: { name: string | null; email: string | null; userId: string; workspaceRole: string };
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{personLabel(person)}</p>
      {person.name && person.email && (
        <p className="truncate text-xs text-muted-foreground">{person.email}</p>
      )}
    </div>
  );
}
