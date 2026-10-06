/**
 * Pure helpers for the People list's access picker (Workspace settings). An
 * access value mirrors the server's `AccessGrant`: a workspace role plus the
 * spaces a non-admin is in, or (Plus/Pro) a set of single-profile grants.
 * Client-safe and unit-tested.
 */

export type MemberRole = "viewer" | "editor" | "admin";

export type AccessValue =
  /** `spaceIds` is absent where the caller can't see it (a non-admin's view of the list). */
  | { mode: "all"; role: MemberRole; spaceIds?: string[] }
  | { mode: "profiles"; entries: { profileId: string; role: MemberRole }[] };

export type NamedOption = { id: string; name: string; icon: string | null };

export const ROLE_NAMES: Record<MemberRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
};

/** What each role can do, in the picker's words. */
export const ROLE_ABILITIES: Record<MemberRole, string> = {
  viewer: "Read",
  editor: "Read + write",
  admin: "Everything",
};

function label(o: NamedOption): string {
  return `${o.icon ? `${o.icon} ` : ""}${o.name}`;
}

/** "All spaces", "No spaces", "🏠 Home", "2 spaces" — for `spaceIds` among `spaces`. */
export function spacesSummary(spaceIds: readonly string[], spaces: readonly NamedOption[]): string {
  const known = spaces.filter((s) => spaceIds.includes(s.id));
  if (spaces.length > 0 && known.length === spaces.length) return "All spaces";
  if (known.length === 0) return "No spaces";
  if (known.length === 1) return label(known[0]!);
  return `${known.length} spaces`;
}

/**
 * A one-line summary of someone's access — the People list's trigger/badge:
 * "Admin", "Editor · 2 spaces", "Viewer · All spaces", "3 profiles".
 */
export function accessSummary(
  access: AccessValue,
  spaces: readonly NamedOption[],
  profiles: readonly NamedOption[],
): string {
  if (access.mode === "all") {
    const role = ROLE_NAMES[access.role];
    if (access.role === "admin" || access.spaceIds === undefined) return role;
    return `${role} · ${spacesSummary(access.spaceIds, spaces)}`;
  }
  if (access.entries.length === 0) return "No profiles";
  if (access.entries.length === 1) {
    const p = profiles.find((x) => x.id === access.entries[0]!.profileId);
    return p ? label(p) : "1 profile";
  }
  return `${access.entries.length} profiles`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** Whether two access values grant the same thing (order of ids doesn't matter). */
export function accessEqual(a: AccessValue, b: AccessValue): boolean {
  if (a.mode === "all" && b.mode === "all") {
    if (a.role !== b.role) return false;
    if (a.role === "admin") return true;
    return sameSet(a.spaceIds ?? [], b.spaceIds ?? []);
  }
  if (a.mode === "profiles" && b.mode === "profiles") {
    if (a.entries.length !== b.entries.length) return false;
    const bByProfile = new Map(b.entries.map((e) => [e.profileId, e.role]));
    return a.entries.every((e) => bByProfile.get(e.profileId) === e.role);
  }
  return false;
}

/**
 * The grant to send for a picked role: admins see every space (no list); a
 * viewer/editor keeps the spaces already picked, or every space when none
 * were picked yet (switching away from admin, or from per-profile access).
 */
export function withRole(
  access: AccessValue,
  role: MemberRole,
  allSpaceIds: readonly string[],
): AccessValue {
  if (role === "admin") return { mode: "all", role };
  const spaceIds =
    access.mode === "all" && access.role !== "admin" && access.spaceIds !== undefined
      ? access.spaceIds
      : [...allSpaceIds];
  return { mode: "all", role, spaceIds };
}
