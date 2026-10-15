/**
 * The sidebar's section list, as the person arranged it — `ui_prefs.sidebar.nav`.
 * Sections sit either in the list itself (`main`) or folded under "More"
 * (`more`); "More" is an entry of `main` too, so it can be dragged like any
 * section. Pure and client-safe: the server cleans what it stores and reads
 * with it, and the sidebar uses it to keep a drag's result well-formed.
 */

/** Every section the sidebar can show, in their default order. */
export const SIDEBAR_NAV_IDS = [
  "tracker",
  "ask",
  "transactions",
  "analytics",
  "budgets",
  "files",
  "invoices",
  "split",
] as const;
export type SidebarNavId = (typeof SIDEBAR_NAV_IDS)[number];

/** The "More" group's own entry in `main`. */
export const MORE_ID = "more";
export type SidebarNavEntry = SidebarNavId | typeof MORE_ID;

export type SidebarNavLayout = { main: SidebarNavEntry[]; more: SidebarNavId[] };

/** Where a new person starts: the everyday sections out, Invoices and Split under More. */
export function defaultSidebarNav(): SidebarNavLayout {
  return {
    main: ["tracker", "ask", "transactions", "analytics", "budgets", "files", MORE_ID],
    more: ["invoices", "split"],
  };
}

export function isSidebarNavId(id: unknown): id is SidebarNavId {
  return typeof id === "string" && (SIDEBAR_NAV_IDS as readonly string[]).includes(id);
}

/**
 * Clean a stored or sent layout: known sections only, each exactly once, and
 * "More" once in `main`. A section the layout predates (one added since it was
 * saved) goes where the default puts it — under More, or in the list just
 * above More — so it shows up without the person losing their order. Anything
 * that isn't a layout at all reads as the default.
 */
export function normalizeSidebarNav(value: unknown): SidebarNavLayout {
  if (!value || typeof value !== "object") return defaultSidebarNav();
  const raw = value as { main?: unknown; more?: unknown };
  if (!Array.isArray(raw.main) || !Array.isArray(raw.more)) return defaultSidebarNav();

  const seen = new Set<string>();
  const main: SidebarNavEntry[] = [];
  const more: SidebarNavId[] = [];
  for (const id of raw.main) {
    if ((id === MORE_ID || isSidebarNavId(id)) && !seen.has(id)) {
      seen.add(id);
      main.push(id);
    }
  }
  for (const id of raw.more) {
    if (isSidebarNavId(id) && !seen.has(id)) {
      seen.add(id);
      more.push(id);
    }
  }
  if (!seen.has(MORE_ID)) main.push(MORE_ID);

  const defaults = defaultSidebarNav();
  for (const id of SIDEBAR_NAV_IDS) {
    if (seen.has(id)) continue;
    if (defaults.more.includes(id)) more.push(id);
    else main.splice(main.indexOf(MORE_ID), 0, id);
  }
  return { main, more };
}
