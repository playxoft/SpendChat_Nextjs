"use client";

import { useState, useSyncExternalStore } from "react";
import { isSupportedCurrency } from "@/lib/currencies";
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
 * Pending query-string changes, flushed together after a pause in typing.
 * Debounced because Safari throws once `replaceState` runs ~100 times in 10s,
 * which fast typing into a live calculator can reach.
 */
const pending = new Map<string, string | null>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flushUrl() {
  flushTimer = undefined;
  const url = new URL(window.location.href);
  for (const [key, value] of pending) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  pending.clear();
  // Next integrates native history calls with its router (see "Native History
  // API" in the Next docs), so this doesn't fight client navigation.
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function queueUrlWrite(changes: Record<string, string | null>) {
  for (const [key, value] of Object.entries(changes)) pending.set(key, value);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushUrl, 400);
}

/** Longest value we'll read back from the URL — a shared link, not a payload. */
const MAX_PARAM = 2000;

// ---------------------------------------------------------------------------
// useUrlState — a calculator's inputs, mirrored into the query string
// ---------------------------------------------------------------------------

type UrlStore<T extends Record<string, string>> = {
  subscribe: (l: Listener) => () => void;
  get: () => T;
  set: (patch: Partial<T>) => void;
  reset: () => void;
};

function createUrlStore<T extends Record<string, string>>(defaults: T): UrlStore<T> {
  const listeners = new Set<Listener>();
  let current: T | null = null;

  const read = (): T => {
    if (current) return current;
    const params = new URLSearchParams(window.location.search);
    const fromUrl: Partial<Record<string, string>> = {};
    for (const key of Object.keys(defaults)) {
      const v = params.get(key);
      if (v !== null) fromUrl[key] = v.slice(0, MAX_PARAM);
    }
    current = { ...defaults, ...fromUrl } as T;
    return current;
  };

  const commit = (next: T) => {
    current = next;
    const changes: Record<string, string | null> = {};
    for (const key of Object.keys(defaults)) {
      // Defaults stay out of the URL, so an untouched calculator keeps a clean one.
      changes[key] = next[key] === defaults[key] ? null : next[key]!;
    }
    queueUrlWrite(changes);
    listeners.forEach((l) => l());
  };

  return {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get: read,
    set: (patch) => commit({ ...read(), ...patch }),
    reset: () => commit({ ...defaults }),
  };
}

/**
 * A calculator's inputs, every value a string (they come from text fields and
 * the query string alike — parse with `parseNumber` at the point of use).
 *
 * `defaults` must be a module-level constant: it is read once, on first render.
 * Keys are the query-string names, so keep them short and stable — renaming one
 * breaks every link already shared.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [store] = useState(() => createUrlStore(defaults));
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
  const fromUrl = new URLSearchParams(window.location.search).get(CURRENCY_PARAM);
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

function subscribeCurrency(l: Listener) {
  currencyListeners.add(l);
  return () => currencyListeners.delete(l);
}

/**
 * The currency every amount on a tool page is shown in. Resolved from, in
 * order: a `?currency=` in a shared link, the visitor's last pick on any tool,
 * then the region of their browser language. `USD` on the server.
 */
export function useToolCurrency() {
  const currency = useSyncExternalStore(subscribeCurrency, readCurrency, () => SERVER_CURRENCY);
  return [currency, writeCurrency] as const;
}

/**
 * The page URL to share: the current query string plus (for money tools) the
 * currency, so a link opened abroad shows the same numbers in the same currency.
 */
export function shareUrl({ withCurrency = true }: { withCurrency?: boolean } = {}): string {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushUrl();
  }
  const url = new URL(window.location.href);
  if (withCurrency) url.searchParams.set(CURRENCY_PARAM, readCurrency());
  url.hash = "";
  return url.toString();
}
