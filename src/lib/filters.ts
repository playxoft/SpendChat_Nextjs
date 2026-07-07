import type { TxnFilters } from "./queries";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    search: q?.trim() ? q.trim() : undefined,
  };
}
