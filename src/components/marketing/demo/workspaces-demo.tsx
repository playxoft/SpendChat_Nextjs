"use client";

import { useState } from "react";
import { ChevronRight, ChevronsUpDown, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DEMO_PROFILE_ICON, type DemoProfile } from "./demo-data";
import { useDemoMoney } from "@/hooks/use-demo-currency";
import { ROLE_ABILITIES, ROLE_NAMES } from "@/lib/member-access";
import { PERSONAL_PLANS, PLAN_LIMITS, PLAN_NAMES, type PersonalPlan } from "@/lib/plans";
import {
  PROFILE_ACCESS_LEVELS,
  SPACE_ROLES,
  WORKSPACE_ROLES,
  accessLevelForRole,
  resolveProfileRole,
} from "@/lib/rbac";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { ProfileAccessLevel, SpaceRole, WorkspaceRole } from "@/db/schema";

/**
 * A workspace's spaces and people, with access doing what it actually does.
 *
 * What's worth demonstrating isn't the invite form — it's how access resolves:
 * admins see every space; everyone else sees the spaces they're in, at Read or
 * Read + write; and a per-profile setting (Plus/Pro) for one person on one
 * profile wins over the space in either direction. That's easy to state and
 * hard to picture, so every answer on screen comes from the app's own
 * `resolveProfileRole()` in `src/lib/rbac.ts` — the rule the server runs (in
 * SQL, kept in step with it) on every read and write — rather than a mock-up of
 * it. Change a space role or a profile setting and the sidebar dims, the chips
 * change and the sentence at the bottom rewrites itself.
 *
 * The option lists come from the same module (`SPACE_ROLES`,
 * `PROFILE_ACCESS_LEVELS`, `WORKSPACE_ROLES`) and the words from the People
 * list's own (`ROLE_NAMES` / `ROLE_ABILITIES`), so the demo can't offer a role
 * the app doesn't have or call it something else. Everything else is
 * `useState` — a marketing page must stay statically rendered, so no server
 * action, no `@/lib/queries`, and nothing an invite here could ever send.
 *
 * The currency in the header line is the visitor's own guessed one, via
 * `useDemoMoney()` like every other amount on the site. It belongs there
 * because currency is a *workspace* setting rather than a per-member one.
 */

const WORKSPACE_NAME = "Menon Household";
const WORKSPACE_ICON = "🏠";

/**
 * The demo workspace's plan. Per-profile settings need one that has them, and
 * the people cap on the invite form is read from it.
 */
const DEMO_PLAN: PersonalPlan = "plus";

/** "Plus & Pro" — the plans with per-profile settings, read from the catalogue. */
const PROFILE_ACCESS_PLANS = PERSONAL_PLANS.filter((p) => PLAN_LIMITS[p].profileLevelAccess)
  .map((p) => PLAN_NAMES[p])
  .join(" & ");

export type DemoSpaceId = "family" | "business";

export type DemoSpace = {
  id: DemoSpaceId;
  name: string;
  icon: string;
  profiles: readonly DemoProfile[];
};

/** Two spaces, split the way households actually split visibility. */
export const DEMO_SPACES: readonly DemoSpace[] = [
  { id: "family", name: "Family", icon: "👪", profiles: ["Home", "Personal"] },
  { id: "business", name: "Business", icon: "🏢", profiles: ["Business"] },
];

const ALL_SPACE_IDS = DEMO_SPACES.map((s) => s.id);

export type DemoPerson = {
  id: string;
  name: string;
  email: string;
  /** `workspace_members.role`. Only `admin` changes the answer — below it, spaces decide. */
  workspaceRole: WorkspaceRole;
  owner?: boolean;
  /** `space_members` rows: the spaces this person is in, at Read or Read + write. */
  spaces: Partial<Record<DemoSpaceId, SpaceRole>>;
  /** `profile_overrides` rows (Plus/Pro): one profile, for this person, either way. */
  overrides: Partial<Record<DemoProfile, ProfileAccessLevel>>;
};

/**
 * Three shapes of access on purpose: the owner (an admin, so every space), a
 * partner who can write to the Family space but has the owner's Personal
 * profile hidden from them, and an accountant who reads the Business space and
 * nothing else.
 */
export const SEED_PEOPLE: readonly DemoPerson[] = [
  {
    id: "asha",
    name: "Asha Menon",
    email: "asha@example.com",
    workspaceRole: "admin",
    owner: true,
    spaces: {},
    overrides: {},
  },
  {
    id: "priya",
    name: "Priya Menon",
    email: "priya@example.com",
    workspaceRole: "editor",
    spaces: { family: "editor" },
    overrides: { Personal: "none" },
  },
  {
    id: "dan",
    name: "Dan Okafor",
    email: "dan@example.com",
    workspaceRole: "viewer",
    spaces: { business: "viewer" },
    overrides: {},
  },
];

type Invite = { email: string; role: WorkspaceRole; spaces: DemoSpaceId[] };

const SEED_INVITES: Invite[] = [{ email: "sam@example.com", role: "editor", spaces: ["family"] }];

/** The app's wording for each level — "Read", "Read + write", "No access". */
const ACCESS_LABEL: Record<ProfileAccessLevel, string> = {
  none: "No access",
  read: ROLE_ABILITIES.viewer,
  write: ROLE_ABILITIES.editor,
};

/** Radix Select can't hold an empty value, so "no row" gets a sentinel. */
const NOT_IN_SPACE = "out";
const DEFAULT = "default";

export function spaceOf(profile: DemoProfile): DemoSpace {
  return DEMO_SPACES.find((s) => s.profiles.includes(profile)) ?? DEMO_SPACES[0]!;
}

/** Effective role on one profile — the app's own rule, not a copy of it. */
export function demoProfileRole(person: DemoPerson, profile: DemoProfile): WorkspaceRole | null {
  return resolveProfileRole({
    workspaceRole: person.workspaceRole,
    override: person.overrides[profile] ?? null,
    spaceRole: person.spaces[spaceOf(profile).id] ?? null,
    grantRole: null,
  });
}

/** "Read + write" / "Read" / "Admin" / "No access" — the chip on each profile. */
export function accessLabel(role: WorkspaceRole | null): string {
  if (role === "admin") return ROLE_NAMES.admin;
  return ACCESS_LABEL[accessLevelForRole(role)];
}

function firstNameOf(person: { name: string }): string {
  return person.name.split(" ")[0] ?? person.name;
}

function initialOf(person: { name: string }): string {
  return person.name.trim().charAt(0).toUpperCase();
}

/** "Home", "Home and Personal", "Home, Personal and Business". */
function listOf(items: string[], conjunction = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

/** Profiles in sidebar order: spaces top to bottom, profiles within each. */
const SIDEBAR_ORDER: DemoProfile[] = DEMO_SPACES.flatMap((s) => [...s.profiles]);

/** The plain-English answer under the frame, rebuilt on every change. */
export function accessSentence(person: DemoPerson): string {
  const first = firstNameOf(person);
  if (person.workspaceRole === "admin") {
    return person.owner
      ? `${first} owns the workspace, and an owner is always an admin — so ${first} sees every space and every profile, and manages the spaces, the people and the currency.`
      : `${first} is an admin, so ${first} sees every space and every profile, and manages the spaces, the people and the currency.`;
  }

  const roles = SIDEBAR_ORDER.map((profile) => ({ profile, role: demoProfileRole(person, profile) }));
  const write = roles.filter((r) => r.role === "editor").map((r) => r.profile);
  const read = roles.filter((r) => r.role === "viewer").map((r) => r.profile);
  const hidden = roles.filter((r) => r.role === null).map((r) => r.profile);

  if (write.length === 0 && read.length === 0) {
    return `${first} is in the workspace but sees no profile at all — add ${first} to a space to change that.`;
  }

  const parts: string[] = [];
  if (write.length > 0) parts.push(`can add and edit in ${listOf(write)}`);
  if (read.length > 0) parts.push(`can read ${listOf(read)}`);
  if (hidden.length > 0) parts.push(`can't see ${listOf(hidden, "or")}`);
  let sentence = `${first} ${listOf(parts)}.`;

  const overridden = SIDEBAR_ORDER.filter((p) => person.overrides[p] != null);
  if (overridden.length > 0) {
    sentence +=
      overridden.length === 1
        ? ` On ${overridden[0]}, the per-profile setting wins over the ${spaceOf(overridden[0]!).name} space.`
        : ` On ${listOf(overridden)}, per-profile settings win over the space.`;
  }
  if (write.length === 0) {
    sentence += ` With nothing to write to, ${first} gets a read-only notice where the composer would be.`;
  }
  return sentence;
}

/** The right-hand summary on a People row. */
function rowSummary(person: DemoPerson): string {
  if (person.workspaceRole === "admin") {
    return person.owner ? `Owner · ${ROLE_NAMES.admin}` : ROLE_NAMES.admin;
  }
  const spaces = DEMO_SPACES.filter((s) => person.spaces[s.id]).map(
    (s) => `${s.name}: ${ROLE_ABILITIES[person.spaces[s.id]!]}`,
  );
  const settings = Object.keys(person.overrides).length;
  if (settings > 0) spaces.push(`${settings} profile ${settings === 1 ? "setting" : "settings"}`);
  return spaces.length > 0 ? spaces.join(" · ") : "In no space yet";
}

function inviteSummary(invite: Invite): string {
  const role = ROLE_NAMES[invite.role];
  if (invite.role === "admin") return `Joins as ${role} — every space — when they sign up`;
  if (invite.spaces.length === 0) return `Joins as ${role}, in no space yet, when they sign up`;
  const names = DEMO_SPACES.filter((s) => invite.spaces.includes(s.id)).map((s) => s.name);
  return `Joins as ${role} · ${listOf(names)} when they sign up`;
}

/** A compact Select in the settings page's `h-8` size. */
function AccessSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("h-8 w-44 shrink-0 text-xs", className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SPACE_OPTIONS = [
  { value: NOT_IN_SPACE, label: "Not in space" },
  ...SPACE_ROLES.map((role) => ({ value: role, label: ROLE_ABILITIES[role] })),
];

export function WorkspacesDemo() {
  const money = useDemoMoney();
  const [people, setPeople] = useState<readonly DemoPerson[]>(SEED_PEOPLE);
  const [invites, setInvites] = useState<Invite[]>(SEED_INVITES);
  const [selectedId, setSelectedId] = useState("priya");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("viewer");
  const [inviteSpaces, setInviteSpaces] = useState<DemoSpaceId[]>(ALL_SPACE_IDS);

  const selected = people.find((p) => p.id === selectedId) ?? people[0]!;
  const first = firstNameOf(selected);
  const isAdmin = selected.workspaceRole === "admin";
  const reach = SIDEBAR_ORDER.map((profile) => ({
    profile,
    role: demoProfileRole(selected, profile),
  }));

  const peopleCap = PLAN_LIMITS[DEMO_PLAN].members;
  // People who count towards the plan: members and pending invites alike.
  const full = people.length + invites.length >= peopleCap;

  function updatePerson(id: string, change: (p: DemoPerson) => DemoPerson) {
    setPeople((prev) => prev.map((p) => (p.id === id ? change(p) : p)));
  }

  function setSpaceRole(id: string, space: DemoSpace, value: string) {
    updatePerson(id, (p) => {
      const spaces = { ...p.spaces };
      if (value === NOT_IN_SPACE) {
        delete spaces[space.id];
        // As in the app: taking someone out of a space also clears their
        // per-profile settings on its profiles.
        const overrides = { ...p.overrides };
        for (const profile of space.profiles) delete overrides[profile];
        return { ...p, spaces, overrides };
      }
      spaces[space.id] = value as SpaceRole;
      return { ...p, spaces };
    });
  }

  function setOverride(id: string, profile: DemoProfile, value: string) {
    updatePerson(id, (p) => {
      const overrides = { ...p.overrides };
      if (value === DEFAULT) delete overrides[profile];
      else overrides[profile] = value as ProfileAccessLevel;
      return { ...p, overrides };
    });
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value.includes("@") || full) return;
    if (invites.some((i) => i.email === value) || people.some((p) => p.email === value)) return;
    setInvites((prev) => [
      ...prev,
      { email: value, role: inviteRole, spaces: inviteRole === "admin" ? [] : inviteSpaces },
    ]);
    setEmail("");
  }

  function reset() {
    setPeople(SEED_PEOPLE);
    setInvites(SEED_INVITES);
    setSelectedId("priya");
    setEmail("");
    setInviteRole("viewer");
    setInviteSpaces(ALL_SPACE_IDS);
  }

  const headerLine = [
    `${PLAN_NAMES[DEMO_PLAN]} plan`,
    `${people.length} people`,
    invites.length > 0 ? `${invites.length} pending` : null,
    `${DEMO_SPACES.length} spaces`,
    money.code,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <DemoFrame
        label="Interactive workspaces demo"
        active="/app/settings"
        className="h-[38rem]"
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
              {first}&apos;s sidebar
            </p>
            {/* Spaces as the app draws them — foldable groups holding their
                profiles — with what this person can't see dimmed rather than
                removed, so the difference between two people is visible. */}
            <div className="space-y-1 pb-2">
              {DEMO_SPACES.map((space) => {
                const sees = space.profiles.some((p) => demoProfileRole(selected, p) !== null);
                return (
                  <div key={space.id}>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg py-1.5 pr-2 pl-1.5 text-sm transition-colors",
                        sees ? "text-muted-foreground" : "text-muted-foreground/40",
                      )}
                    >
                      <ChevronRight aria-hidden className="size-3.5 shrink-0 rotate-90" />
                      <span aria-hidden className="text-sm leading-none">
                        {space.icon}
                      </span>
                      <span className="truncate font-medium">{space.name}</span>
                    </div>
                    {space.profiles.map((profile) => {
                      const role = demoProfileRole(selected, profile);
                      return (
                        <div
                          key={profile}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-6 text-sm transition-colors",
                            role ? "text-foreground" : "text-muted-foreground/40",
                          )}
                        >
                          <span aria-hidden className="text-base leading-none">
                            {DEMO_PROFILE_ICON[profile]}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{profile}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {role ? accessLabel(role) : "Hidden"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
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
              <p className="truncate text-xs text-muted-foreground">{headerLine}</p>
            </div>
            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
              You&apos;re an admin
            </Badge>
          </div>
        }
        bodyClassName="overflow-hidden"
        footer={
          <div className="shrink-0 border-t bg-muted/20 px-4 py-3">
            <p className="text-sm font-medium">What {first} can see</p>
            <p aria-live="polite" className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {accessSentence(selected)}
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
                  <span className="text-muted-foreground">{accessLabel(role)}</span>
                </span>
              ))}
            </div>
          </div>
        }
      >
        <div
          tabIndex={0}
          role="group"
          aria-label="Workspace people and access"
          className="h-full space-y-4 overflow-y-auto px-4 py-3"
        >
          <div>
            <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              People
            </p>
            <ul className="space-y-0.5">
              {people.map((person) => {
                const isSelected = person.id === selected.id;
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(person.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent/60 hover:bg-accent/60",
                      )}
                    >
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium"
                      >
                        {initialOf(person)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {person.name}
                          {person.owner && <span className="text-muted-foreground"> (you)</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {person.email}
                        </span>
                      </span>
                      <span className="max-w-[45%] shrink-0 text-right text-xs text-muted-foreground">
                        {rowSummary(person)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">{first}&apos;s access</p>
            {isAdmin ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {selected.owner ? "Owners are always admins, and admins" : "Admins"} see every
                space and every profile — no space can be hidden from them, so there is nothing to
                set here.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  The space decides what {first} can do with everything in it. A profile row set
                  to anything but Default wins over the space — to hide one profile, or to open
                  one.{" "}
                  <Badge variant="outline" className="align-middle">
                    {PROFILE_ACCESS_PLANS}
                  </Badge>
                </p>
                <ul className="mt-3 space-y-3">
                  {DEMO_SPACES.map((space) => {
                    const spaceRole = selected.spaces[space.id] ?? null;
                    const defaultLabel = ACCESS_LABEL[accessLevelForRole(spaceRole)];
                    return (
                      <li key={space.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium">
                            <span aria-hidden className="mr-1.5">
                              {space.icon}
                            </span>
                            {space.name}
                            <span className="font-normal text-muted-foreground"> space</span>
                          </span>
                          <AccessSelect
                            value={spaceRole ?? NOT_IN_SPACE}
                            onChange={(v) => setSpaceRole(selected.id, space, v)}
                            options={SPACE_OPTIONS}
                            ariaLabel={`${selected.name}'s role in the ${space.name} space`}
                          />
                        </div>
                        <ul className="mt-1.5 ml-2 space-y-1.5 border-l pl-3">
                          {space.profiles.map((profile) => {
                            const override = selected.overrides[profile] ?? null;
                            return (
                              <li
                                key={profile}
                                className="flex flex-wrap items-center justify-between gap-2"
                              >
                                <span className="min-w-0 truncate text-sm">
                                  <span aria-hidden className="mr-1.5">
                                    {DEMO_PROFILE_ICON[profile]}
                                  </span>
                                  {profile}
                                </span>
                                <AccessSelect
                                  value={override ?? DEFAULT}
                                  onChange={(v) => setOverride(selected.id, profile, v)}
                                  options={[
                                    { value: DEFAULT, label: `Default (${defaultLabel})` },
                                    ...PROFILE_ACCESS_LEVELS.map((level) => ({
                                      value: level,
                                      label: ACCESS_LABEL[level],
                                    })),
                                  ]}
                                  ariaLabel={`${selected.name}'s access to the ${profile} profile`}
                                  className={cn(override && "border-foreground/30 font-medium")}
                                  // Like the app's space dialog: per-profile settings are
                                  // for people in the space. Out of it, the space decides.
                                  disabled={spaceRole === null && override === null}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Taking someone out of a space also clears their profile settings in it.
                </p>
              </>
            )}
          </div>

          <form onSubmit={handleInvite} className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-end gap-2">
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
              <AccessSelect
                value={inviteRole}
                onChange={(v) => setInviteRole(v as WorkspaceRole)}
                options={WORKSPACE_ROLES.map((role) => ({
                  value: role,
                  label: `${ROLE_NAMES[role]} — ${ROLE_ABILITIES[role]}`,
                }))}
                ariaLabel="Role for the person you are inviting"
              />
              <Button type="submit" size="sm" className="h-8 shrink-0 gap-1.5" disabled={full}>
                <UserPlus className="size-3.5" /> Add
              </Button>
            </div>
            {inviteRole === "admin" ? (
              <p className="text-xs text-muted-foreground">Admins see every space.</p>
            ) : (
              <fieldset>
                <legend className="text-xs text-muted-foreground">Spaces they can see</legend>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {DEMO_SPACES.map((space) => {
                    const id = `demo-invite-space-${space.id}`;
                    return (
                      <div key={space.id} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={inviteSpaces.includes(space.id)}
                          onCheckedChange={(c) =>
                            setInviteSpaces((prev) =>
                              c === true
                                ? [...prev.filter((s) => s !== space.id), space.id]
                                : prev.filter((s) => s !== space.id),
                            )
                          }
                        />
                        <Label htmlFor={id} className="gap-1.5 text-sm font-normal">
                          <span aria-hidden>{space.icon}</span>
                          {space.name}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {full && (
              <p className="text-xs text-muted-foreground">
                {PLAN_NAMES[DEMO_PLAN]} includes {peopleCap} people, pending invites included.
                Cancel an invite to add someone else.
              </p>
            )}
          </form>

          {invites.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Pending invites
              </p>
              <ul className="divide-y">
                {invites.map((invite) => (
                  <li key={invite.email} className="flex items-center gap-2 px-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">{inviteSummary(invite)}</p>
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
      {/* "Reset", not "Replay": there's no script here, it puts the access you
          changed back. Under the frame like every other demo's control, and
          rendered unconditionally so it can't arrive on the first click and
          shift the page. */}
      <DemoReplay onClick={reset} label="Reset" />
    </>
  );
}
