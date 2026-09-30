"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isSupportedCurrency } from "@/lib/currencies";
import { fromCanonicalNumber, toCanonicalNumber } from "@/lib/tools/format";
import { currencyForCountry, regionFromLocale } from "@/lib/geo";

/**
 * Client state for the `/tools/*` calculators.
 *
 * Tool pages are static: the server renders every calculator with its defaults,
 * which is also what crawlers index. Per-visitor state — values from a shared
 * link, the visitor's currency and number format — only exists in the browser.
 * Each piece lives in a small external store read through
 * `useSyncExternalStore`, whose server snapshot is the default: hydration
 * matches the static HTML, and the visitor's values arrive on the re-render
 * straight after, with no setState-in-an-effect.
 */

type Listener = () => void;

// ---------------------------------------------------------------------------
// URL writes
// ---------------------------------------------------------------------------

/**
 * Pending URL-fragment changes, flushed together after a pause in typing.
 * Debounced because Safari throws once `replaceState` runs ~100 times in 10s,
 * which fast typing into a live calculator can reach.
 *
 * Each batch belongs to the page that queued it. A batch still pending when the
 * visitor clicks through to another tool is dropped rather than written onto
 * the next page's URL — and dropped before it fires, since a `replaceState` in
 * the middle of a client navigation makes Next restore the old page.
 */
let pending: { path: string; changes: Map<string, string | null> } | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Tool state lives in the URL's `#fragment`, not its query string: browsers
 * never send the fragment to a server, so what someone types — a date of
 * birth, a salary — can't end up in request logs or in analytics page views,
 * yet a copied link still reopens the same calculation.
 */
function readFragment(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function flushUrl() {
  flushTimer = undefined;
  const batch = pending;
  pending = null;
  if (!batch || batch.path !== window.location.pathname) return;
  const params = readFragment();
  for (const [key, value] of batch.changes) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const fragment = params.toString();
  // Next integrates native history calls with its router (see "Native History
  // API" in the Next docs), so this doesn't fight client navigation.
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${fragment ? `#${fragment}` : ""}`,
  );
}

function queueUrlWrite(changes: Record<string, string | null>) {
  const path = window.location.pathname;
  if (!pending || pending.path !== path) pending = { path, changes: new Map() };
  for (const [key, value] of Object.entries(changes)) pending.changes.set(key, value);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushUrl, 400);
}

/** Forget writes queued for `path` — its calculator is unmounting (navigating away). */
function dropPendingFor(path: string) {
  if (pending?.path !== path) return;
  pending = null;
  clearTimeout(flushTimer);
  flushTimer = undefined;
}

/** Longest value we'll read back from the URL — a shared link, not a payload. */
const MAX_PARAM = 2000;

/**
 * Numbers are written to the URL in one canonical form and shown in the
 * reader's own format — "1.500" typed in Germany is 1500, and must not open as
 * 1.5 for someone in the UK. Dates, modes and encoded lists travel as typed.
 */
const toUrlValue = (value: string) => toCanonicalNumber(value, navigator.language || "en-US");
const fromUrlValue = (value: string) => fromCanonicalNumber(value, navigator.language || "en-US");

// ---------------------------------------------------------------------------
// useUrlState — a calculator's inputs, mirrored into the URL fragment
// ---------------------------------------------------------------------------

type UrlStore<T extends Record<string, string>> = {
  subscribe: (l: Listener) => () => void;
  get: () => T;
  set: (patch: Partial<T>) => void;
  reset: () => void;
};

function createUrlStore<T extends Record<string, string>>(defaults: T, path: string): UrlStore<T> {
  const listeners = new Set<Listener>();
  let current: T | null = null;

  const read = (): T => {
    if (current) return current;
    // On a client navigation the new page renders before Next updates the
    // address bar, so the URL still belongs to the previous tool. Reading it
    // then would carry that tool's inputs across; wait for our own URL (React
    // re-checks the snapshot after commit).
    if (window.location.pathname !== path) return defaults;
    const params = readFragment();
    const fromUrl: Partial<Record<string, string>> = {};
    for (const key of Object.keys(defaults)) {
      const v = params.get(key);
      if (v !== null) fromUrl[key] = fromUrlValue(v.slice(0, MAX_PARAM));
    }
    current = { ...defaults, ...fromUrl } as T;
    return current;
  };

  const commit = (next: T) => {
    current = next;
    const changes: Record<string, string | null> = {};
    for (const key of Object.keys(defaults)) {
      // Defaults stay out of the URL, so an untouched calculator keeps a clean one.
      changes[key] = next[key] === defaults[key] ? null : toUrlValue(next[key]!);
    }
    queueUrlWrite(changes);
    listeners.forEach((l) => l());
  };

  return {
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
        if (listeners.size === 0) dropPendingFor(path);
      };
    },
    get: read,
    set: (patch) => commit({ ...read(), ...patch }),
    reset: () => commit({ ...defaults }),
  };
}

/**
 * A calculator's inputs, every value a string (they come from text fields and
 * the URL fragment alike — parse with `parseNumber` at the point of use).
 *
 * `defaults` must be a module-level constant: it is read once, on first render.
 * Keys are the fragment's parameter names, so keep them short and stable —
 * renaming one breaks every link already shared.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const pathname = usePathname();
  const [store] = useState(() => createUrlStore(defaults, pathname));
  const state = useSyncExternalStore(store.subscribe, store.get, () => defaults);
  return [state, store.set, store.reset] as const;
}

// ---------------------------------------------------------------------------
// Locale — the visitor's number format
// ---------------------------------------------------------------------------

const noopSubscribe = () => () => {};

/** The visitor's formatting locale (`en-IN` groups 1,00,000). `en-US` on the server. */
export function useToolLocale(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => navigator.language || "en-US",
    () => "en-US",
  );
}

// ---------------------------------------------------------------------------
// Currency — shared by every tool on the page, remembered across tools
// ---------------------------------------------------------------------------

const CURRENCY_KEY = "spendchat:tools:currency";
const CURRENCY_PARAM = "currency";
const SERVER_CURRENCY = "USD";

const currencyListeners = new Set<Listener>();
let currentCurrency: string | null = null;

function detectCurrency(): string {
  const fromUrl = readFragment().get(CURRENCY_PARAM);
  if (fromUrl && isSupportedCurrency(fromUrl.toUpperCase())) return fromUrl.toUpperCase();
  try {
    const saved = window.localStorage.getItem(CURRENCY_KEY);
    if (saved && isSupportedCurrency(saved)) return saved;
  } catch {
    // Storage blocked (private mode, sandboxed preview) — fall through.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = currencyForCountry(regionFromLocale(tag));
    if (code) return code;
  }
  return SERVER_CURRENCY;
}

function readCurrency(): string {
  currentCurrency ??= detectCurrency();
  return currentCurrency;
}

function writeCurrency(code: string) {
  if (!isSupportedCurrency(code)) return;
  currentCurrency = code;
  try {
    window.localStorage.setItem(CURRENCY_KEY, code);
  } catch {
    // Not remembered — still applies for this page view.
  }
  queueUrlWrite({ [CURRENCY_PARAM]: code });
  currencyListeners.forEach((l) => l());
}

/** The page currency right now, for code outside React (an Undo that restores it). */
export function getToolCurrency(): string {
  return readCurrency();
}

/** Set the page currency from outside React. */
export const setToolCurrency = writeCurrency;

function subscribeCurrency(l: Listener) {
  currencyListeners.add(l);
  return () => currencyListeners.delete(l);
}

/**
 * The currency every amount on a tool page is shown in. Resolved from, in
 * order: a `#currency=` in a shared link, the visitor's last pick on any tool,
 * then the region of their browser language. `USD` on the server.
 */
export function useToolCurrency() {
  const currency = useSyncExternalStore(subscribeCurrency, readCurrency, () => SERVER_CURRENCY);
  return [currency, writeCurrency] as const;
}

/**
 * The page URL to share: the current fragment plus (for money tools) the
 * currency, so a link opened abroad shows the same numbers in the same currency.
 */
export function shareUrl({ withCurrency = true }: { withCurrency?: boolean } = {}): string {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushUrl();
  }
  const params = readFragment();
  if (withCurrency) params.set(CURRENCY_PARAM, readCurrency());
  const fragment = params.toString();
  return `${window.location.origin}${window.location.pathname}${window.location.search}${fragment ? `#${fragment}` : ""}`;
}
