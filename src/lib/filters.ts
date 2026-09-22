import type { SortColumn, SortDir, TxnFilters } from "./queries";
import { TAGS_PER_TRANSACTION_MAX } from "./validation";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SORT_COLUMNS: SortColumn[] = ["date", "category", "title", "description", "amount"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A `?profile=` value that names a real profile, or undefined for "all". */
export function parseActiveProfile(value: string | null): string | undefined {
  return value && value !== "all" && UUID_RE.test(value) ? value : undefined;
}

/**
 * Resolve the profile filter for the web UI, where the default (no `?profile=`)
 * is the user's *first* profile and "All profiles" must be chosen explicitly
 * (`?profile=all`). Returns undefined only when All profiles is active. The
 * mobile API keeps its own default — all profiles — via `parseActiveProfile`,
 * which is why this resolver lives separately.
 */
export function resolveWebProfile(
  value: string | null,
  firstProfileId: string | undefined,
): string | undefined {
  if (value === "all") return undefined; // explicit "All profiles"
  return parseActiveProfile(value) ?? firstProfileId;
}

/**
 * The `?tags=` filter: a comma-separated list of tag ids.
 *
 * One comma-joined parameter rather than a repeatable `?tag=`, because several
 * things downstream read a query value as a single string — the transactions
 * page rebuilds its export and print links from `Object.entries(searchParams)`
 * and takes `v[0]` for an array — and a repeatable key would silently collapse
 * to its first value there. One key, one string, no collapse.
 *
 * Unknown-shaped ids are dropped rather than failing the whole parse: a filter
 * is a view, and a mangled URL should narrow oddly, not 500. Deduped, and
 * capped at the same ceiling a transaction can carry, so a hand-written URL
 * can't turn the filter into an unbounded `IN` list.
 *
 * Exported because the filter control reads the same parameter back to decide
 * what to tick. It had its own `split(",")` for a while, which trimmed nothing,
 * deduped nothing and capped nothing — so a hand-made URL could show fifteen
 * tags ticked while ten were filtering. One parser, one answer.
 */
export function parseTagIds(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const ids = [
    ...new Set(
      value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s)),
    ),
  ].slice(0, TAGS_PER_TRANSACTION_MAX);
  return ids.length ? ids : undefined;
}

/** Parse transaction filters from a query getter (URLSearchParams or searchParams). */
export function parseTxnFilters(get: (key: string) => string | null): TxnFilters {
  const type = get("type");
  const category = get("category");
  const from = get("from");
  const to = get("to");
  const q = get("q");

  return {
    type: type === "income" || type === "expense" ? type : undefined,
    categoryId: category && category !== "all" ? category : undefined,
    profileId: parseActiveProfile(get("profile")),
    tagIds: parseTagIds(get("tags")),
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    search: q?.trim() ? q.trim() : undefined,
  };
}

/**
 * Parse the web table's column sort. Kept out of `parseTxnFilters` on purpose so
 * the mobile API (which parses filters the same way) never gains a sort it
 * doesn't document. An unknown column yields no sort (the default order).
 */
export function parseTxnSort(
  sort: string | null,
  dir: string | null,
): { sort?: SortColumn; dir?: SortDir } {
  if (!sort || !SORT_COLUMNS.includes(sort as SortColumn)) return {};
  return { sort: sort as SortColumn, dir: dir === "asc" ? "asc" : "desc" };
}
