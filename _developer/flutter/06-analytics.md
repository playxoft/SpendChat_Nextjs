# 06 · Analytics

Summary + category breakdown + monthly trend, driven by a date-range filter.
Route: `/analytics`. Default range: **the current calendar month**.

Data (all scoped by the current profile + workspace):
- `GET /analytics/summary?from&to&profile&…` → `{ income, expense, balance }`.
- `GET /analytics/categories?type=expense&from&to&profile` → category totals.
- `GET /analytics/monthly?from=<6-months-ago-start>&profile` → 6-month trend.

All values are **minor units** → format with the currency decimals.

---

## 1. Screen layout

- **Header:** title **"Analytics"** + a subtitle showing the current range label
  (e.g. `"Jul 1, 2026 – Jul 31, 2026"`, or `"All time"`).
- **Filter bar** (§2).
- **Summary cards** (§3).
- **Category pie card** (§4).
- **Monthly trend card** (§5).

---

## 2. Filter bar & range presets

A segmented range toggle plus optional custom From/To pickers.

**Presets:**

| Label | Range |
|---|---|
| **This month** *(default)* | current calendar month (start-of-month → end-of-month) |
| **3 months** | start of the month 2 months ago → today |
| **6 months** | start of the month 5 months ago → today |
| **12 months** | start of the month 11 months ago → today |
| **All time** | no date bounds |

- Default active preset = **This month**.
- **From/To pickers** let the user set a custom range (From max = To or today; To
  max = today). Setting either switches to a "custom range" state (no preset
  highlighted).
- A **Clear** control resets to the default month.
- The bar can also carry Type/Category filters (the API supports them on
  `summary`); at minimum implement the date range + profile. Profile comes from
  the global scope.

Show a small spinner while a new range is loading.

---

## 3. Summary cards

Three cards in a row (stack on narrow): a label + a big value (24px, semibold,
tabular).

| Card | Value | Colour |
|---|---|---|
| **Income** | `formatMoney(income)` | **emerald** |
| **Expenses** | `formatMoney(expense)` | **neutral `foreground`** (NOT red) |
| **Net** | `formatMoney(balance)` | **emerald if `balance ≥ 0`, else neutral `foreground`** |

- `balance = income − expense`; a negative balance renders with a leading `−`
  (U+2212) but stays **neutral** here (the analytics cards do **not** use rose —
  only the tracker header's month balance does).

---

## 4. Category pie chart

A donut of **expenses by category** for the selected range
(`GET /analytics/categories?type=expense`). Card title **"Spending by category"**,
description "Expenses for the selected range".

- Use `fl_chart` `PieChart` as a **donut** (inner radius ~56, outer ~90, small
  pad angle, thin stroke). Slices ordered by descending total.
- **Palette (exact — cycle by index `i % 10`):**

  | # | Hex | # | Hex |
  |---|---|---|---|
  | 1 | `#6366F1` (indigo) | 6 | `#8B5CF6` (violet) |
  | 2 | `#10B981` (emerald) | 7 | `#EC4899` (pink) |
  | 3 | `#F59E0B` (amber) | 8 | `#14B8A6` (teal) |
  | 4 | `#EF4444` (red) | 9 | `#F97316` (orange) |
  | 5 | `#3B82F6` (blue) | 10 | `#A3A3A3` (gray) |

- **Legend** (list beside/under the chart), one row per slice: a colour swatch
  matching the slice + `{icon} {name}` (icon omitted if null; name = category
  name or "Uncategorized") on the left; on the right `{formatMoney(total)} · {%}`
  where `% = round(total / grandTotal * 100)`.
- Tooltip on tap: the formatted amount.
- **Empty state:** when there's no expense data in range —
  **"No expense data for this range yet."**

---

## 5. Monthly trend

**"Last 6 months" — "Income vs. expenses".** This is **NOT** a chart library
widget in the web app — it's a **custom horizontal dual-bar list**. Reproduce
that (it's simple and looks clean), or use a grouped bar chart if you prefer.

- Data: the last 6 calendar months (oldest → current), from
  `GET /analytics/monthly?from=<start-of-month-5-months-ago>&profile`. **This
  endpoint ignores the analytics filter bar** except `profile` and the fixed
  6-month `from`.
- **Legend:** Income dot = **emerald-500**; Expense dot = **`foreground/60`**
  (near-neutral).
- Each of the 6 rows: a month label (`"Jul 2026"`, ~48px wide) + two stacked
  thin bars (`h-2.5`, rounded-full) — income `emerald-500 @ 70%`, expense
  `foreground @ 60%` — each width = `value / max(all values, 1) * 100%`; and a
  right-aligned value `formatMoney(income − expense)` (tabular).
- Always renders 6 rows (zero-width bars when a month has no data) — no separate
  empty state.

---

## 6. Skeleton

While loading: 3 summary-card placeholders, a circular pie placeholder with ~5
legend lines, and a trend card with 6 bar lines. Pull-to-refresh reloads the
current range.
