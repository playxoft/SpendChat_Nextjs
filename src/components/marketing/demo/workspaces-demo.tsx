"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DemoFrame } from "./demo-frame";
import { DemoReplay } from "./demo-replay";
import { DEMO_PROFILES, DEMO_PROFILE_ICON, type DemoProfile } from "./demo-data";
import { useDemoMoney } from "@/hooks/use-demo-currency";
import { WORKSPACE_ROLES, maxRole } from "@/lib/rbac";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/db/schema";

/**
 * The workspace's people list, with the roles doing what they actually do.
 *
 * The thing worth demonstrating here isn't the invite form — it's that access
 * has two independent sources (workspace membership and a per-profile grant)
 * and that the *higher* of the two wins on any given profile. That rule is easy
 * to state and hard to picture, so the demo computes it live with the app's own
 * `maxRole()` from `src/lib/rbac.ts` rather than a mock-up of it: change the
 * role on a row and the sidebar dims, the chips change, and the sentence at the
 * bottom rewrites itself.
 *
 * `WORKSPACE_ROLES` comes from the same module, so the three roles offered here
 * can't drift from the three the server enforces. Everything else is `useState`
 * — a marketing page must stay statically rendered, so no server action, no
 * `@/lib/queries`, and nothing an invite here could ever send.
 *
 * The currency in the header line is the visitor's own guessed one, via
 * `useDemoMoney()` like every other amount on the site. It belongs in this
 * demo's summary because currency is a *workspace* setting rather than a
 * per-member one — that's the sentence the line is making — and a hard-coded
 * "USD" would have been the one thing in the frame that didn't follow the
 * reader.
 */

const WORKSPACE_NAME = "Menon Household";
const WORKSPACE_ICON = "🏠";

type Grant = { profile: DemoProfile; role: WorkspaceRole };

type Member = {
  id: string;
  name: string;
  email: string;
  /** Workspace-wide membership role; null = access via a per-profile grant only. */
  role: WorkspaceRole | null;
  /** Per-profile grants, exactly like `profile_access` rows. */
  grants: Grant[];
  owner?: boolean;
};

/**
 * Three shapes of access on purpose: the owner, a partner who is a viewer
 * workspace-wide but an editor on one profile, and an accountant who isn't a
 * member at all and reaches exactly one profile.
 */
const SEED_MEMBERS: Member[] = [
  {
    id: "asha",
    name: "Asha Menon",
    email: "asha@example.com",
    role: "admin",
    grants: [],
    owner: true,
  },
  {
    id: "priya",
    name: "Priya Menon",
    email: "priya@example.com",
    role: "viewer",
    grants: [{ profile: "Home", role: "editor" }],
  },
  {
    id: "dan",
    name: "Dan Okafor",
    email: "dan@example.com",
    role: null,
    grants: [{ profile: "Business", role: "viewer" }],
  },
];

type Invite = { email: string; role: WorkspaceRole };

const SEED_INVITES: Invite[] = [{ email: "sam@example.com", role: "editor" }];

/** What each role actually permits — the wording the settings page uses. */
const ROLE_SUMMARY: Record<WorkspaceRole, string> = {
  viewer: "read the feed, the table and the reports, but not add, edit or delete anything",
  editor: "add, edit and delete transactions, and attach receipts to them",
  admin: "do everything an editor can, plus manage profiles, categories, currency and who else is in here",
};

/**
 * The same three roles, described at profile scope. A grant is only ever about
 * one profile, so even an admin grant stops at that profile's edge — workspace
 * settings and the member list need a membership, not a grant.
 */
const GRANT_SUMMARY: Record<WorkspaceRole, string> = {
  viewer: "read the feed, the table and the reports",
  editor: "add, edit and delete transactions and attach receipts",
  admin: "manage the profile itself as well as its transactions — workspace settings and members still need a membership",
};

function firstNameOf(member: Member): string {
  return member.name.split(" ")[0] ?? member.name;
}

function initialOf(member: Member): string {
  return member.name.trim().charAt(0).toUpperCase();
}

/** "an editor" / "a viewer" — the sentence at the bottom is rebuilt on every change. */
function articleFor(role: WorkspaceRole): string {
  return role === "viewer" ? "a" : "an";
}

/** Effective role on one profile: max(membership, grant) — the app's rule. */
function effectiveRole(member: Member, profile: DemoProfile): WorkspaceRole | null {
  const grant = member.grants.find((g) => g.profile === profile)?.role ?? null;
  return maxRole(member.role, grant);
}

/** The role the row's select edits: the membership if there is one, else the grant. */
function rowRole(member: Member): WorkspaceRole {
  return member.role ?? member.grants[0]?.role ?? "viewer";
}

function scopeLabel(member: Member): string {
  if (member.role !== null) return "All profiles";
  const grant = member.grants[0];
  return grant ? `${DEMO_PROFILE_ICON[grant.profile]} ${grant.profile} only` : "No profiles";
}

/** The settings page's role picker, same `h-8` and same three options. */
function RoleSelect({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as WorkspaceRole)}>
      <SelectTrigger className={cn("h-8 w-28 shrink-0 capitalize", className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {WORKSPACE_ROLES.map((role) => (
          <SelectItem key={role} value={role} className="capitalize">
            {role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function WorkspacesDemo() {
  const money = useDemoMoney();
  const [members, setMembers] = useState<Member[]>(SEED_MEMBERS);
  const [invites, setInvites] = useState<Invite[]>(SEED_INVITES);
  const [selectedId, setSelectedId] = useState("priya");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("viewer");

  const selected = members.find((m) => m.id === selectedId) ?? members[0]!;
  const first = firstNameOf(selected);

  /** The live answer: what the selected person reaches, profile by profile. */
  const reach = useMemo(
    () =>
      DEMO_PROFILES.map((profile) => ({
        profile,
        role: effectiveRole(selected, profile),
      })),
    [selected],
  );

  function setRowRole(id: string, role: WorkspaceRole) {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        // A member's select moves their workspace role; a grant-only person's
        // moves the grant, because they have no membership to move.
        if (m.role !== null) return { ...m, role };
        return { ...m, grants: m.grants.map((g, i) => (i === 0 ? { ...g, role } : g)) };
      }),
    );
  }

  function setGrantRole(id: string, profile: DemoProfile, role: WorkspaceRole) {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, grants: m.grants.map((g) => (g.profile === profile ? { ...g, role } : g)) }
          : m,
      ),
    );
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value.includes("@")) return;
    if (invites.some((i) => i.email === value)) return;
    setInvites((prev) => [...prev, { email: value, role: inviteRole }]);
    setEmail("");
  }

  function reset() {
    setMembers(SEED_MEMBERS);
    setInvites(SEED_INVITES);
    setSelectedId("priya");
    setEmail("");
    setInviteRole("viewer");
  }

  const peopleLine = [
    `${members.length} people`,
    invites.length > 0 ? `${invites.length} pending` : null,
    `shared categories · ${money.code}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
    <DemoFrame
      label="Interactive workspaces demo"
      active="/app/settings"
      className="h-[36rem]"
      sidebarTop={
        <div className="px-2 pt-2">
          {/* The sidebar's workspace switcher, inert — its job here is to show
              that a workspace is the thing you're inside of, not a setting. */}
          <div className="flex h-9 items-center gap-2 rounded-lg border px-2 text-sm">
            <span aria-hidden className="text-base leading-none">
              {WORKSPACE_ICON}
            </span>
            <span className="min-w-0 flex-1 truncate">{WORKSPACE_NAME}</span>
            <Kbd combo={comboFor("workspace.switch")} className="shrink-0 opacity-60" />
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </div>

          <p className="px-1 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {first}&apos;s profiles
          </p>
          <div className="space-y-0.5 pb-2">
            {reach.map(({ profile, role }) => (
              <div
                key={profile}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
                  role ? "text-foreground" : "text-muted-foreground/40",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {DEMO_PROFILE_ICON[profile]}
                </span>
                <span className="min-w-0 flex-1 truncate">{profile}</span>
                <span className="shrink-0 text-xs text-muted-foreground capitalize">
                  {role ?? "hidden"}
                </span>
              </div>
            ))}
          </div>
        </div>
      }
      header={
        <div className="flex shrink-0 items-center gap-2.5 border-b px-4 py-3">
          <span aria-hidden className="text-lg leading-none">
            {WORKSPACE_ICON}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{WORKSPACE_NAME}</p>
            <p className="truncate text-xs text-muted-foreground">{peopleLine}</p>
          </div>
          <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
            You&apos;re an admin
          </Badge>
        </div>
      }
      bodyClassName="overflow-hidden"
      footer={
        <div className="shrink-0 border-t bg-muted/20 px-4 py-3">
          <p className="text-sm font-medium">What {first} can do</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {selected.role === null ? (
              <>
                {first} is not a member of this workspace at all. Access comes
                from a single grant on{" "}
                {DEMO_PROFILE_ICON[selected.grants[0]?.profile ?? "Personal"]}{" "}
                {selected.grants[0]?.profile ?? "one profile"}, so there {first}{" "}
                can {GRANT_SUMMARY[rowRole(selected)]}. Nothing else in the
                workspace exists as far as {first} is concerned.
              </>
            ) : (
              <>
                {first} is {articleFor(selected.role)} {selected.role} of the
                whole workspace, so they can {ROLE_SUMMARY[selected.role]}.
                {selected.grants.map((g) => (
                  <span key={g.profile}>
                    {" "}
                    On {g.profile} there is also {articleFor(g.role)} {g.role}{" "}
                    grant — the higher of the two applies, which makes {first}{" "}
                    {effectiveRole(selected, g.profile) ?? "hidden"} there.
                  </span>
                ))}
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reach.map(({ profile, role }) => (
              <span
                key={profile}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs",
                  role ? "bg-background" : "border-dashed text-muted-foreground/60",
                )}
              >
                <span aria-hidden>{DEMO_PROFILE_ICON[profile]}</span>
                {profile}
                <span className="text-muted-foreground capitalize">
                  {role ?? "no access"}
                </span>
              </span>
            ))}
          </div>
        </div>
      }
    >
      <div className="h-full space-y-4 overflow-y-auto px-4 py-3">
        <form
          onSubmit={handleInvite}
          className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3"
        >
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="demo-invite-email" className="text-xs">
              Invite by email
            </Label>
            <Input
              id="demo-invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accountant@example.com"
              className="h-8"
            />
          </div>
          <RoleSelect
            value={inviteRole}
            onChange={setInviteRole}
            ariaLabel="Role for the person you are inviting"
          />
          <Button type="submit" size="sm" className="h-8 shrink-0 gap-1.5">
            <UserPlus className="size-3.5" /> Add
          </Button>
        </form>

        <div>
          <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            People with access
          </p>
          <ul className="divide-y">
            {members.map((member) => {
              const isSelected = member.id === selected.id;
              return (
                <li
                  key={member.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-lg px-2 py-2.5 transition-colors",
                    isSelected && "bg-accent/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(member.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium"
                    >
                      {initialOf(member)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {member.name}
                        {member.owner && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                  </button>

                  {member.owner ? (
                    <>
                      <Badge variant="secondary" className="shrink-0">
                        Owner
                      </Badge>
                      <Badge variant="outline" className="shrink-0 capitalize">
                        {member.role}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {scopeLabel(member)}
                      </span>
                      <RoleSelect
                        value={rowRole(member)}
                        onChange={(role) => setRowRole(member.id, role)}
                        ariaLabel={`Role for ${member.name}`}
                      />
                    </>
                  )}

                  {/* The second source of access, shown where it applies: a
                      grant on one profile, sitting on top of the membership. */}
                  {member.role !== null &&
                    member.grants.map((grant) => (
                      <div
                        key={grant.profile}
                        className="flex w-full flex-wrap items-center gap-2 pl-10 text-xs text-muted-foreground"
                      >
                        <span>
                          Plus a grant on {DEMO_PROFILE_ICON[grant.profile]} {grant.profile}
                        </span>
                        <RoleSelect
                          value={grant.role}
                          onChange={(role) => setGrantRole(member.id, grant.profile, role)}
                          ariaLabel={`${member.name} role on ${grant.profile}`}
                          className="h-7 w-24"
                        />
                        <span>
                          effective there:{" "}
                          <span className="text-foreground capitalize">
                            {effectiveRole(member, grant.profile) ?? "none"}
                          </span>
                        </span>
                      </div>
                    ))}
                </li>
              );
            })}
          </ul>
        </div>

        {invites.length > 0 && (
          <div>
            <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Pending invites
            </p>
            <ul className="divide-y">
              {invites.map((invite) => (
                <li key={invite.email} className="flex flex-wrap items-center gap-2 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joins as {invite.role} when they sign up
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Cancel the invite for ${invite.email}`}
                    onClick={() =>
                      setInvites((prev) => prev.filter((i) => i.email !== invite.email))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DemoFrame>
    {/* "Reset", not "Replay": there's no script here, it puts the roles you
        changed back. Under the frame rather than in its header, where it used
        to be — the header is a copy of the app's, and the app has no Reset
        button in it. Rendered unconditionally, like every other demo's, so it
        can't appear on the first click and shift the page as it arrives. */}
    <DemoReplay onClick={reset} label="Reset" />
    </>
  );
}
