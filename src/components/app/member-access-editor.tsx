"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { profileAccessLock } from "@/lib/add-limits";
import {
  ROLE_ABILITIES,
  ROLE_NAMES,
  accessEqual,
  accessSummary,
  withRole,
  type AccessValue,
  type MemberRole,
  type NamedOption,
} from "@/lib/member-access";
import { cn } from "@/lib/utils";
import { UpgradeHint, usePlan } from "./upgrade-dialog";
import { LimitTooltip, LockGlyph } from "./limit-lock";

/**
 * The People list's access picker. Two ways to give someone access:
 *
 *  - **Spaces** (every plan): one role — Viewer (Read), Editor (Read + write)
 *    or Admin — and, below admin, which spaces they're in (all by default).
 *    Admins see every space.
 *  - **Specific profiles** (Plus/Pro): single-profile grants, each at its own
 *    role, without being a workspace member. On Free it's shown locked with an
 *    upgrade hint; existing grants keep working and can be switched to spaces.
 */

const ROLE_ORDER: MemberRole[] = ["viewer", "editor", "admin"];

function optionLabel(o: NamedOption): string {
  return `${o.icon ? `${o.icon} ` : ""}${o.name}`;
}

function RoleSelect({
  value,
  onChange,
  ariaLabel,
  className,
  disabled,
}: {
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MemberRole)} disabled={disabled}>
      <SelectTrigger className={cn("h-8", className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_ORDER.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_NAMES[r]} — {ROLE_ABILITIES[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ScopeEditor({
  value,
  onChange,
  spaces,
  profiles,
}: {
  value: AccessValue;
  onChange: (v: AccessValue) => void;
  spaces: NamedOption[];
  profiles: NamedOption[];
}) {
  const { plan, profileLevelAccess } = usePlan();
  const allSpaceIds = spaces.map((s) => s.id);
  const isAll = value.mode === "all";
  const profilesLocked = !profileLevelAccess;
  const profilesLock = profilesLocked ? profileAccessLock(plan) : null;

  // Role to carry across a mode switch.
  const seedRole: MemberRole = isAll ? value.role : (value.entries[0]?.role ?? "viewer");

  function pickMode(mode: "all" | "profiles") {
    if (mode === value.mode) return;
    if (mode === "all") onChange(withRole(value, seedRole, allSpaceIds));
    else onChange({ mode: "profiles", entries: [] });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5" aria-label="Access type">
        {(
          [
            ["all", "Spaces"],
            ["profiles", "Specific profiles"],
          ] as const
        ).map(([mode, text]) => {
          const locked = mode === "profiles" && profilesLocked;
          const disabled = locked && value.mode !== "profiles";
          return (
            // Locked on Free: a lock and the reason in a tooltip (on a wrapper,
            // since the disabled button itself gets no pointer events).
            <LimitTooltip
              key={mode}
              lock={locked ? profilesLock : null}
              wrapperClassName={disabled ? "flex" : undefined}
            >
              <button
                type="button"
                aria-pressed={value.mode === mode}
                disabled={disabled}
                onClick={() => pickMode(mode)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  value.mode === mode
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {locked && <LockGlyph className="size-3" />}
                {text}
              </button>
            </LimitTooltip>
          );
        })}
      </div>

      {profilesLock && <UpgradeHint info={profilesLock.info}>{profilesLock.reason}</UpgradeHint>}

      {value.mode === "all" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <RoleSelect
              value={value.role}
              onChange={(r) => onChange(withRole(value, r, allSpaceIds))}
              ariaLabel="Role"
              className="w-full"
            />
          </div>
          {value.role === "admin" ? (
            <p className="text-xs text-muted-foreground">
              Admins see every space and manage the workspace.
            </p>
          ) : (
            <SpacePicker
              selected={value.spaceIds ?? allSpaceIds}
              spaces={spaces}
              onChange={(spaceIds) => onChange({ mode: "all", role: value.role, spaceIds })}
            />
          )}
        </div>
      ) : (
        <ProfilePicker
          entries={value.entries}
          profiles={profiles}
          seedRole={seedRole}
          disabled={profilesLocked}
          onChange={(entries) => onChange({ mode: "profiles", entries })}
        />
      )}
    </div>
  );
}

function SpacePicker({
  selected,
  spaces,
  onChange,
}: {
  selected: string[];
  spaces: NamedOption[];
  onChange: (ids: string[]) => void;
}) {
  if (spaces.length === 0) {
    return <p className="text-xs text-muted-foreground">This workspace has no spaces yet.</p>;
  }
  const chosen = new Set(selected);
  const count = spaces.filter((s) => chosen.has(s.id)).length;
  const all = count === spaces.length;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Spaces they can see</p>
      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent">
        <Checkbox
          checked={all ? true : count > 0 ? "indeterminate" : false}
          onCheckedChange={() => onChange(all ? [] : spaces.map((s) => s.id))}
          aria-label="All spaces"
        />
        <span className="flex-1 text-sm font-medium">All spaces</span>
      </label>
      <Separator />
      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {spaces.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent"
          >
            <Checkbox
              checked={chosen.has(s.id)}
              onCheckedChange={(c) =>
                onChange(
                  c === true
                    ? [...selected.filter((id) => id !== s.id), s.id]
                    : selected.filter((id) => id !== s.id),
                )
              }
              aria-label={s.name}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{optionLabel(s)}</span>
          </label>
        ))}
      </div>
      {count === 0 && (
        <p className="text-xs text-muted-foreground">
          In no space yet — they&apos;ll see nothing until you add them to one.
        </p>
      )}
    </div>
  );
}

function ProfilePicker({
  entries,
  profiles,
  seedRole,
  disabled,
  onChange,
}: {
  entries: { profileId: string; role: MemberRole }[];
  profiles: NamedOption[];
  seedRole: MemberRole;
  disabled: boolean;
  onChange: (entries: { profileId: string; role: MemberRole }[]) => void;
}) {
  const roleOf = (id: string) => entries.find((e) => e.profileId === id)?.role;
  return (
    <fieldset disabled={disabled} className="max-h-56 space-y-0.5 overflow-y-auto">
      <legend className="sr-only">Profiles</legend>
      {profiles.map((p) => {
        const role = roleOf(p.id);
        const checked = role !== undefined;
        return (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent"
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(c) =>
                onChange(
                  c === true
                    ? [...entries.filter((e) => e.profileId !== p.id), { profileId: p.id, role: seedRole }]
                    : entries.filter((e) => e.profileId !== p.id),
                )
              }
              aria-label={p.name}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{optionLabel(p)}</span>
            {checked && (
              <RoleSelect
                value={role}
                disabled={disabled}
                onChange={(r) =>
                  onChange(entries.map((e) => (e.profileId === p.id ? { ...e, role: r } : e)))
                }
                className="h-7 w-[7.5rem]"
                ariaLabel={`Role for ${p.name}`}
              />
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

function isInvalid(v: AccessValue): boolean {
  return v.mode === "profiles" && v.entries.length === 0;
}

/** Popover used in the invite form — a controlled picker, no Save (the form's Add button commits). */
export function AccessPicker({
  value,
  onChange,
  spaces,
  profiles,
  className,
}: {
  value: AccessValue;
  onChange: (v: AccessValue) => void;
  spaces: NamedOption[];
  profiles: NamedOption[];
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
          <span className="truncate">{accessSummary(value, spaces, profiles)}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" closeOnOutsideClick className="w-80">
        <ScopeEditor value={value} onChange={onChange} spaces={spaces} profiles={profiles} />
      </PopoverContent>
    </Popover>
  );
}

/** Popover used on a person/invite row — edits a draft and commits on Save. */
export function AccessEditor({
  current,
  spaces,
  profiles,
  pending,
  onSave,
}: {
  current: AccessValue;
  spaces: NamedOption[];
  profiles: NamedOption[];
  pending: boolean;
  onSave: (v: AccessValue) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<AccessValue>(current);
  const changed = !accessEqual(draft, current);

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
          className="h-8 max-w-[12rem] justify-between gap-1.5 font-normal"
        >
          <span className="truncate">{accessSummary(current, spaces, profiles)}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" closeOnOutsideClick className="w-80">
        <ScopeEditor value={draft} onChange={setDraft} spaces={spaces} profiles={profiles} />
        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !changed || isInvalid(draft)}
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

/** Read-only access display (owner, and the list as non-admins see it). */
export function AccessBadge({
  access,
  spaces,
  profiles,
}: {
  access: AccessValue;
  spaces: NamedOption[];
  profiles: NamedOption[];
}) {
  return <Badge variant="outline">{accessSummary(access, spaces, profiles)}</Badge>;
}
