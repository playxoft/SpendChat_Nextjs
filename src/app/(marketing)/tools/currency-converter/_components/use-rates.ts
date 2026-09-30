"use client";

import { useSyncExternalStore } from "react";
import {
  RATE_BASE,
  isFresh,
  parseCurrencyApiRates,
  parseFrankfurterRates,
  restoreRateTable,
  type RateList,
  type RateSource,
  type RateTable,
} from "@/lib/tools/currency";

/**
 * Exchange rates for the currency converter, downloaded by the visitor's
 * browser — never at build time and never through a server of ours.
 *
 * Only the day's rate list is requested (the same URL for everyone); the
 * amounts a visitor types never leave the page. The list is kept in
 * `localStorage` for `RATES_MAX_AGE_MS`, so a returning visitor converts
 * instantly and the feeds see one request per device per half-day at most.
 *
 * Two independent, free, keyless feeds, tried in order:
 * 1. Frankfurter — central-bank reference rates, blended across ~100 official
 *    sources (v2 API; v1 is ECB-only and deprecated).
 * 2. The open `currency-api` dataset (CC0), from jsDelivr and then its
 *    Cloudflare Pages mirror, as its author asks clients to do.
 * If both fail, the last cached list (however old) stays in use and the tool
 * says so; with nothing cached it shows an offline message and a retry.
 *
 * State lives in a small external store read with `useSyncExternalStore`: the
 * server snapshot is "loading", so the static HTML and hydration agree, and a
 * cached list appears on the render straight after.
 */

export const SOURCE_INFO: Record<RateSource, { name: string; href: string }> = {
  frankfurter: { name: "Frankfurter (central-bank reference rates)", href: "https://frankfurter.dev/" },
  "currency-api": { name: "fawazahmed0/exchange-api (open data)", href: "https://github.com/fawazahmed0/exchange-api" },
};

const FEEDS: { source: RateSource; urls: string[]; parse: (json: unknown) => RateList | null }[] = [
  {
    source: "frankfurter",
    urls: [`https://api.frankfurter.dev/v2/rates?base=${RATE_BASE}`],
    parse: parseFrankfurterRates,
  },
  {
    source: "currency-api",
    urls: [
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${RATE_BASE.toLowerCase()}.json`,
    ],
    parse: parseCurrencyApiRates,
  },
];

const CACHE_KEY = "spendchat:tools:fx-rates";
const TIMEOUT_MS = 8000;

export type RatesState = {
  /** The list in use — fresh, or the last one this device saved. */
  table: RateTable | null;
  /** `loading` while a download runs; `failed` when the last attempt got nothing. */
  status: "idle" | "loading" | "ready" | "failed";
};

const SERVER_STATE: RatesState = { table: null, status: "loading" };

const listeners = new Set<() => void>();
let state: RatesState | null = null;
let inFlight: Promise<void> | null = null;

function readCache(): RateTable | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? restoreRateTable(JSON.parse(raw)) : null;
  } catch {
    // Storage blocked or the saved value is corrupted — start without it.
    return null;
  }
}

function writeCache(table: RateTable) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(table));
  } catch {
    // Not saved — the rates still apply for this page view.
  }
}

function current(): RatesState {
  state ??= { table: readCache(), status: "idle" };
  return state;
}

function update(next: RatesState) {
  state = next;
  listeners.forEach((l) => l());
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function download(): Promise<RateTable | null> {
  for (const feed of FEEDS) {
    for (const url of feed.urls) {
      try {
        const list = feed.parse(await fetchJson(url));
        if (list) return { ...list, source: feed.source, fetchedAt: Date.now() };
      } catch {
        // Offline, blocked, timed out or not JSON — try the next one.
      }
    }
  }
  return null;
}

/** Download the rates now, unless a download is already running. */
export function refreshRates(): Promise<void> {
  if (inFlight) return inFlight;
  update({ ...current(), status: "loading" });
  inFlight = download()
    .then((table) => {
      if (table) {
        writeCache(table);
        update({ table, status: "ready" });
      } else {
        update({ ...current(), status: "failed" });
      }
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // The first reader on the page decides whether the saved list will do.
  const s = current();
  if (s.status === "idle") {
    if (s.table && isFresh(s.table.fetchedAt, Date.now())) {
      queueMicrotask(() => update({ ...current(), status: "ready" }));
    } else {
      queueMicrotask(() => void refreshRates());
    }
  }
  return () => listeners.delete(listener);
}

function serverState(): RatesState {
  return SERVER_STATE;
}

/** The rate list for the converter, downloading it (or reusing today's copy) on first use. */
export function useRates(): RatesState {
  return useSyncExternalStore(subscribe, current, serverState);
}
