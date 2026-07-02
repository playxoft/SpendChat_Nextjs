import { fromMinorUnits } from "@/lib/money";
import { getCurrency } from "@/lib/currencies";
import type { TransactionRow } from "@/lib/queries";
import type { Category, Profile, UserSettings } from "@/db/schema";

/**
 * Row → API DTO mappers. Routes serialize through these so the wire shape
 * stays stable and matches the OpenAPI spec. The DB stores money as integer
 * minor units (the source of truth, `amountMinor`); we also emit `amount` as a
 * major-unit string so the Flutter client can display without re-deriving the
 * currency's decimal count.
 */

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
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
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
  color: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeCategory(c: Category): ApiCategory {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    color: c.color,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
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
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type ApiSettings = {
  currency: string;
  locale: string;
  theme: string;
  inputMode: string;
  currencyDetail: { code: string; symbol: string; decimals: number };
};

export function serializeSettings(s: UserSettings): ApiSettings {
  const c = getCurrency(s.currency);
  return {
    currency: s.currency,
    locale: s.locale,
    theme: s.theme,
    inputMode: s.inputMode,
    currencyDetail: { code: c.code, symbol: c.symbol, decimals: c.decimals },
  };
}
