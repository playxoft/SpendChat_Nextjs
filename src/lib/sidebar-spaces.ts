import { SIDEBAR_COLLAPSED_MAX } from "@/lib/validation";

/**
 * Pure helpers behind the sidebar's space tree (workspace → space → profile).
 * Client-safe and unit-tested; the components only render what these return.
 */

export type SpaceLike = { id: string; position: number };
export type SpacedProfile = { id: string; spaceId: string };

export type SpaceGroup<S, P> = { space: S; profiles: P[] };

/**
 * Profiles grouped under their spaces, in sidebar order: spaces by
 * `position` (ties keep the order given), profiles in the order given (the
 * server's sort order). Profiles whose space isn't in `spaces` — which the
 * server shouldn't send, but a stale list could — come back as `orphans`, so
 * nothing the user can open ever silently disappears from the sidebar.
 */
export function groupProfilesBySpace<S extends SpaceLike, P extends SpacedProfile>(
  spaces: readonly S[],
  profiles: readonly P[],
): { groups: SpaceGroup<S, P>[]; orphans: P[] } {
  const ordered = spaces
    .map((space, i) => ({ space, i }))
    .sort((a, b) => a.space.position - b.space.position || a.i - b.i)
    .map((x) => x.space);
  const bySpace = new Map<string, P[]>(ordered.map((s) => [s.id, []]));
  const orphans: P[] = [];
  for (const p of profiles) {
    const list = bySpace.get(p.spaceId);
    if (list) list.push(p);
    else orphans.push(p);
  }
  return {
    groups: ordered.map((space) => ({ space, profiles: bySpace.get(space.id) ?? [] })),
    orphans,
  };
}

/** Every profile in sidebar order — what Shift+1…0 count through. */
export function flattenGroups<S, P>(groups: readonly SpaceGroup<S, P>[], orphans: readonly P[]): P[] {
  return [...groups.flatMap((g) => g.profiles), ...orphans];
}

/** Shift + 1…9, then 0 for the 10th; "" past that. */
export function profileShortcut(index: number): string {
  return index >= 0 && index < 10 ? `shift+${(index + 1) % 10}` : "";
}

/** Fold (`collapsed`) or unfold one space in the saved list: newest first, capped. */
export function toggleCollapsed(list: readonly string[], id: string, collapsed: boolean): string[] {
  const rest = list.filter((x) => x !== id);
  return collapsed ? [id, ...rest].slice(0, SIDEBAR_COLLAPSED_MAX) : rest;
}

/** Swap a space with its neighbour (`-1` up, `+1` down); null when it can't move. */
export function moveSpace<T extends { id: string }>(
  spaces: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] | null {
  const from = spaces.findIndex((s) => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= spaces.length) return null;
  const next = [...spaces];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/**
 * The workspace's full profile order after reordering one space's profiles:
 * spaces in sidebar order, `reordered` standing in for that space's list.
 * `reorderProfiles` takes the whole list, so a drag inside one space still
 * sends every profile — and evens out any old cross-space numbering.
 */
export function profileOrderAfterReorder<S extends SpaceLike, P extends SpacedProfile>(
  groups: readonly SpaceGroup<S, P>[],
  orphans: readonly P[],
  spaceId: string,
  reordered: readonly P[],
): string[] {
  return [
    ...groups.flatMap((g) => (g.space.id === spaceId ? reordered : g.profiles)),
    ...orphans,
  ].map((p) => p.id);
}
