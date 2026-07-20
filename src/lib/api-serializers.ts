import { fromMinorUnits } from "@/lib/money";
import { getCurrency } from "@/lib/currencies";
import type { TransactionRow } from "@/lib/queries";
import type { WorkspaceSummary } from "@/lib/workspaces";
import type { Category, Profile, UserSettings } from "@/db/schema";

/**
 * Row → API DTO mappers. Routes serialize through these so the wire shape
 * stays stable and matches the OpenAPI spec. The DB stores money as integer
 * minor units (the source of truth, `amountMinor`); we also emit `amount` as a
 * major-unit string so the Flutter client can display without re-deriving the
 * currency's decimal count.
 */

/**
 * Timestamps come back from drizzle as `Date` (`mode:'date'`), but every
 * serializer guards the same way so a driver that ever hands back a string
 * can't 500 one endpoint while the others keep working.
 */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export type ApiTransaction = {
  id: string;
  type: "income" | "expense";
  amountMinor: number;
  amount: string;
  title: string | null;
  description: string | null;
  occurredOn: string;
  createdAt: string;
  category: { id: string; name: string | null; icon: string | null } | null;
  profile: { id: string; name: string | null; icon: string | null };
};

export function serializeTransaction(row: TransactionRow, currency: string): ApiTransaction {
  const decimals = getCurrency(currency).decimals;
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    amount: fromMinorUnits(row.amountMinor, currency).toFixed(decimals),
    title: row.title,
    description: row.description,
    occurredOn: row.occurredOn,
    createdAt: toIso(row.createdAt),
    category: row.categoryId
      ? { id: row.categoryId, name: row.categoryName, icon: row.categoryIcon }
      : null,
    profile: { id: row.profileId, name: row.profileName, icon: row.profileIcon },
  };
}

export type ApiCategory = {
  id: string;
  name: string;
  kind: "income" | "expense";
  icon: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeCategory(c: Category): ApiCategory {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
  };
}

export type ApiProfile = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export function serializeProfile(p: Profile): ApiProfile {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    sortOrder: p.sortOrder,
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  };
}

/**
 * User settings that follow the user across workspaces. Currency + number format
 * moved to the workspace (see `ApiWorkspace`) — they are no longer here.
 */
export type ApiSettings = {
  theme: string;
  inputMode: string;
};

export function serializeSettings(s: UserSettings): ApiSettings {
  return {
    theme: s.theme,
    inputMode: s.inputMode,
  };
}

/**
 * A workspace the caller can open, including its currency + number format
 * (which every member shares). `currencyDetail` saves the client re-deriving the
 * decimal count. `role` is null when access is via a per-profile grant only.
 */
export type ApiWorkspace = {
  id: string;
  name: string;
  /** Emoji shown beside the name; null when unset. */
  icon: string | null;
  role: WorkspaceSummary["role"];
  currency: string;
  locale: string;
  currencyDetail: { code: string; symbol: string; decimals: number };
};

export function serializeWorkspace(w: WorkspaceSummary): ApiWorkspace {
  const c = getCurrency(w.currency);
  return {
    id: w.id,
    name: w.name,
    icon: w.icon,
    role: w.role,
    currency: w.currency,
    locale: w.locale,
    currencyDetail: { code: c.code, symbol: c.symbol, decimals: c.decimals },
  };
}
