/**
 * Which profiles the web app is showing — the sidebar's selection, as it rides
 * in the URL. Pure and client-safe: the pages, the sidebar and the composer's
 * shortcuts all read the same parameter through these functions, so they can't
 * disagree about what is selected.
 *
 * **One parameter, `?profile=`, carries the whole selection.** Every link that
 * already carries it (`hrefWithProfile`, the Ask links, the settings redirect)
 * carries a multi-selection unchanged, and every link written before
 * multi-select existed still means what it meant:
 *
 *     (absent)           the first profile — the web default
 *     all                every profile the viewer can see
 *     <uuid>             one profile (a plain click; the original link shape)
 *     <item>,<item>,…    a selection, where each item is a profile `<uuid>` or
 *                        a space `s.<uuid>` — every live profile in that space
 *
 * A space is a token of its own rather than its profiles spelled out, so the
 * URL stays short and a space keeps meaning "this space" as profiles move in
 * and out of it. The `s.` prefix can't collide with a uuid (hex and dashes
 * only) and survives `URLSearchParams` unescaped.
 *
 * **Nothing here is access control.** A selection is a *view*: the server
 * expands it against the profiles the viewer can see (`resolveProfileScope`
 * over `getProfiles`), and every query intersects it again with
 * `accessibleProfileIds` (`profilesInScope` in `queries.ts`). A forged or
 * foreign id only ever narrows what is shown.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marks a space in the list form. */
export const SCOPE_SPACE_PREFIX = "s.";

/**
 * The most items one selection holds. A hand-made URL can't turn the filter
 * into an unbounded `IN` list; the sidebar stops adding at the same number.
 * Spaces make a wide selection cheap to express, so this is a guard, not a
 * limit anyone should meet.
 */
export const SCOPE_MAX_ITEMS = 50;

/**
 * The most profile ids a client may send back once a selection is expanded
 * (the feed's and the list's load-more, the restore read-back). Spaces expand
 * to their profiles, so this sits well above `SCOPE_MAX_ITEMS` and above the
 * widest plan's spaces × profiles; it bounds the `IN` list, nothing else.
 */
export const SCOPE_MAX_PROFILE_IDS = 500;

export type ScopeItem = { kind: "profile" | "space"; id: string };

export type ProfileScope =
  /** No (or no usable) `?profile=`: the first profile. */
  | { kind: "default" }
  /** `?profile=all`. */
  | { kind: "all" }
  /** One or more profiles and spaces, in the order they were picked. Never empty. */
  | { kind: "pick"; items: ScopeItem[] };

/** What a scope resolves against: a profile the viewer can see, and its space. */
export type ScopeProfile = { id: string; spaceId: string };

export type ResolvedScope = {
  /**
   * The profiles in view, in selection order — or `undefined` for every profile
   * the viewer can see ("All profiles"). Only ids from the list the scope was
   * resolved against, so it may be **empty** (a selection of nothing the viewer
   * can see) — which is an empty view, never a widened one.
   */
  profileIds: string[] | undefined;
  /** The one profile in view when the view is a single profile (a plain click,
   *  an old link, the default). Writes are locked to it. */
  single: string | undefined;
  /** True for a selection that isn't a single profile: a space, or several items. */
  multi: boolean;
};

const DEFAULT: ProfileScope = { kind: "default" };
const ALL: ProfileScope = { kind: "all" };

function itemKey(item: ScopeItem): string {
  return `${item.kind}:${item.id}`;
}

function parseItem(token: string): ScopeItem | null {
  if (token.startsWith(SCOPE_SPACE_PREFIX)) {
    const id = token.slice(SCOPE_SPACE_PREFIX.length);
    return UUID_RE.test(id) ? { kind: "space", id: id.toLowerCase() } : null;
  }
  return UUID_RE.test(token) ? { kind: "profile", id: token.toLowerCase() } : null;
}

/** Dedupe (first wins) and cap a list of items. */
function tidy(items: readonly ScopeItem[], cap = SCOPE_MAX_ITEMS): ScopeItem[] {
  const seen = new Set<string>();
  const out: ScopeItem[] = [];
  for (const item of items) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Read `?profile=`. Malformed items are dropped rather than failing the parse —
 * a filter is a view, and a mangled URL should narrow oddly, not 500 — and a
 * value with nothing usable left falls back to the default, exactly as a bad
 * single id always has.
 */
export function parseProfileScope(raw: string | null | undefined): ProfileScope {
  const value = raw?.trim();
  if (!value) return DEFAULT;
  if (value === "all") return ALL;
  const items = tidy(
    value
      .split(",")
      .map((t) => parseItem(t.trim()))
      .filter((i): i is ScopeItem => i !== null),
  );
  return items.length > 0 ? { kind: "pick", items } : DEFAULT;
}

/** The `?profile=` value for a scope; null means "leave the parameter off". */
export function formatProfileScope(scope: ProfileScope): string | null {
  if (scope.kind === "default") return null;
  if (scope.kind === "all") return "all";
  return tidy(scope.items)
    .map((i) => (i.kind === "space" ? `${SCOPE_SPACE_PREFIX}${i.id}` : i.id))
    .join(",");
}

/** A raw `?profile=` value in its canonical (shortest, validated) form. */
export function canonicalProfileParam(raw: string | null | undefined): string | null {
  return formatProfileScope(parseProfileScope(raw));
}

/** The scope for one item — what a plain click on a row selects. */
export function scopeOf(item: ScopeItem): ProfileScope {
  return { kind: "pick", items: [item] };
}

/** True for a selection that isn't a single profile (a space, or several items). */
export function isMultiScope(scope: ProfileScope): boolean {
  return (
    scope.kind === "pick" && !(scope.items.length === 1 && scope.items[0]!.kind === "profile")
  );
}

/**
 * Expand a scope against the profiles the viewer can see (`profiles`, in
 * sidebar order — `getProfiles` on the server, the sidebar's list in the
 * browser). A space becomes its profiles from that list, so a space the viewer
 * can only partly see expands to the part they can see, and one they can't see
 * at all expands to nothing.
 */
export function resolveProfileScope(
  scope: ProfileScope,
  profiles: readonly ScopeProfile[],
): ResolvedScope {
  if (scope.kind === "all") return { profileIds: undefined, single: undefined, multi: false };
  if (scope.kind === "default") {
    const first = profiles[0]?.id;
    return { profileIds: first ? [first] : undefined, single: first, multi: false };
  }
  const known = new Set(profiles.map((p) => p.id));
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  for (const item of scope.items) {
    if (item.kind === "profile") {
      if (known.has(item.id)) add(item.id);
    } else {
      for (const p of profiles) if (p.spaceId === item.id) add(p.id);
    }
  }
  const multi = isMultiScope(scope);
  return { profileIds: ids, single: multi ? undefined : ids[0], multi };
}

/**
 * Where a new transaction goes from this view. One profile in view: that one,
 * locked. A selection: the first profile in it, with the picker open (the
 * same as "All profiles", which defaults to the first profile).
 */
export function writeTargetOf(
  resolved: ResolvedScope,
  profiles: readonly { id: string }[],
): { activeProfileId: string | undefined; allProfiles: boolean } {
  if (resolved.single) return { activeProfileId: resolved.single, allProfiles: false };
  return {
    activeProfileId: resolved.profileIds?.[0] ?? profiles[0]?.id,
    allProfiles: true,
  };
}

/**
 * The profiles a new transaction may go to from this view — the composer's
 * picker. A selection offers just the profiles in it, so an entry can't land
 * somewhere the feed isn't showing (where it would seem to vanish); one
 * profile, "All profiles", and a selection of nothing visible offer them all.
 */
export function writeChoicesOf<T extends { id: string }>(
  resolved: ResolvedScope,
  profiles: readonly T[],
): T[] {
  if (!resolved.multi || !resolved.profileIds?.length) return [...profiles];
  const inView = new Set(resolved.profileIds);
  return profiles.filter((p) => inView.has(p.id));
}

/**
 * The composer's target profile on this render. A sidebar click doesn't
 * remount the composer (the layout router keys ignore search params), so a
 * target picked once would outlive the view it was picked in. It is re-seeded
 * to the view's default (`activeProfileId`, else the first choice) when that
 * default changes — a new view — or when the current target is no longer one of
 * `choices`; otherwise the person's own pick stands.
 */
export function composerTarget(
  current: string,
  seededFrom: string | undefined,
  activeProfileId: string | undefined,
  choices: readonly { id: string }[],
): string {
  const seed = activeProfileId ?? choices[0]?.id ?? "";
  if (seededFrom !== activeProfileId) return seed;
  return choices.some((c) => c.id === current) ? current : seed;
}

/**
 * Shift+click: add `item` to the selection, or take it out.
 *
 * The selection it starts from is what is on screen: the default view counts
 * as its first profile, "All profiles" as nothing picked yet (so Shift+click
 * there just picks that row). Items the sidebar no longer shows are dropped on
 * the way through, so a stale id doesn't ride along forever.
 *
 * - A space covers its profiles: adding one drops its profiles' own items, and
 *   taking out a profile that is only selected *through* its space swaps the
 *   space for its other profiles — which is what the highlight promised.
 * - Returns null when the change would leave nothing selected, or would pass
 *   `SCOPE_MAX_ITEMS`; the caller leaves the selection as it is.
 */
export function toggleScopeItem(
  scope: ProfileScope,
  item: ScopeItem,
  profiles: readonly ScopeProfile[],
  spaceIds: readonly string[],
): ProfileScope | null {
  const knownSpaces = new Set(spaceIds);
  const spaceOf = new Map(profiles.map((p) => [p.id, p.spaceId]));
  let items: ScopeItem[];
  if (scope.kind === "default") items = profiles[0] ? [{ kind: "profile", id: profiles[0].id }] : [];
  else if (scope.kind === "all") items = [];
  else
    items = scope.items.filter((i) =>
      i.kind === "profile" ? spaceOf.has(i.id) : knownSpaces.has(i.id),
    );

  const has = (k: ScopeItem["kind"], id: string) => items.some((i) => i.kind === k && i.id === id);

  let next: ScopeItem[];
  if (item.kind === "space") {
    next = has("space", item.id)
      ? items.filter((i) => !(i.kind === "space" && i.id === item.id))
      : [
          ...items.filter((i) => !(i.kind === "profile" && spaceOf.get(i.id) === item.id)),
          item,
        ];
  } else if (has("profile", item.id)) {
    next = items.filter((i) => !(i.kind === "profile" && i.id === item.id));
  } else {
    const space = spaceOf.get(item.id);
    if (space !== undefined && has("space", space)) {
      // Selected through its space: keep the rest of that space, item by item.
      next = items.flatMap((i) =>
        i.kind === "space" && i.id === space
          ? profiles
              .filter((p) => p.spaceId === space && p.id !== item.id)
              .map((p): ScopeItem => ({ kind: "profile", id: p.id }))
          : [i],
      );
    } else {
      next = [...items, item];
    }
  }

  next = tidy(next, Infinity);
  if (next.length === 0 || next.length > SCOPE_MAX_ITEMS) return null;
  return { kind: "pick", items: next };
}

/**
 * What the sidebar highlights: the profiles in view and the spaces picked as a
 * whole. "All profiles" highlights its own row instead, so both are empty.
 */
export function scopeMembership(
  scope: ProfileScope,
  profiles: readonly ScopeProfile[],
): { profiles: Set<string>; spaces: Set<string> } {
  const resolved = resolveProfileScope(scope, profiles);
  return {
    profiles: new Set(scope.kind === "all" ? [] : (resolved.profileIds ?? [])),
    spaces: new Set(
      scope.kind === "pick" ? scope.items.filter((i) => i.kind === "space").map((i) => i.id) : [],
    ),
  };
}

/**
 * A short name for what is in view, for headers and reports: the profile's
 * name, "All profiles", or the selection's names — `max` of them, then "+N".
 */
export function scopeLabel(
  resolved: ResolvedScope,
  profiles: readonly { id: string; name: string }[],
  max = 3,
): string {
  if (resolved.profileIds === undefined) return "All profiles";
  const byId = new Map(profiles.map((p) => [p.id, p.name]));
  const names = resolved.profileIds.map((id) => byId.get(id)).filter((n): n is string => !!n);
  if (names.length === 0) return resolved.multi ? "No profiles" : "Selected profile";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}
