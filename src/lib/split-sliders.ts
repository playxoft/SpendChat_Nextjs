/**
 * Sliders that always add up — an exact or percent split, and who paid what
 * when several people did. Each person holds a whole number of units (minor
 * units of the currency, or basis points), and together they always make
 * `total`: there's nothing to type, so nothing that "doesn't add up".
 *
 * **Moving one slider moves the others** by the same amount the other way:
 * 1. first the people you haven't touched yet, in proportion to what they
 *    have (evenly when they all have nothing) — so a default even split stays
 *    even among everyone you've left alone;
 * 2. once those are spent (taking) or there are none (giving), the people you
 *    touched longest ago, one at a time — so the slider you set last is the
 *    last to give way.
 *
 * Proportions are apportioned with the largest remainder (ties in display
 * order), in BigInt like `computeShares`, so a 3-decimal currency's totals
 * stay exact. Pure — the expense dialogs, the chat composer and the free
 * calculator all run these.
 */

export type SliderState = {
  /** Who has a slider, in display order. */
  ids: string[];
  /** Units per person; always sums to `total`. */
  values: Record<string, number>;
  total: number;
  /** Who's been moved by hand, least recent first. */
  touched: string[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * `total` divided evenly between `ids`. Leftover units go one each in
 * `leftoverOrder` (default: `ids`) — pass the order the split maths would use,
 * so the even default matches what an equal split of the same people stores.
 */
export function evenSliders(ids: readonly string[], total: number, leftoverOrder?: readonly string[]): SliderState {
  const people = [...ids];
  const n = people.length;
  const values: Record<string, number> = {};
  if (n === 0) return { ids: people, values, total: Math.max(total, 0), touched: [] };
  const safeTotal = Math.max(Math.floor(total), 0);
  const base = Math.floor(safeTotal / n);
  let leftover = safeTotal - base * n;
  for (const id of people) values[id] = base;
  const order = [...(leftoverOrder ?? people).filter((id) => values[id] !== undefined), ...people];
  for (const id of order) {
    if (leftover === 0) break;
    if (values[id] !== base) continue; // already took one
    values[id] = base + 1;
    leftover -= 1;
  }
  return { ids: people, values, total: safeTotal, touched: [] };
}

/**
 * Start from saved values (editing), or evenly when they don't fit — someone
 * missing, a negative, or a sum other than `total`.
 */
export function slidersFrom(
  ids: readonly string[],
  total: number,
  saved: Readonly<Record<string, number>>,
  leftoverOrder?: readonly string[],
): SliderState {
  const values: Record<string, number> = {};
  let sum = 0;
  for (const id of ids) {
    const v = saved[id] ?? 0;
    if (!Number.isSafeInteger(v) || v < 0) return evenSliders(ids, total, leftoverOrder);
    values[id] = v;
    sum += v;
  }
  if (ids.length === 0 || sum !== total) return evenSliders(ids, total, leftoverOrder);
  return { ids: [...ids], values, total, touched: [] };
}

/**
 * Split `amount` between `pool` in proportion to `weights` (evenly when they're
 * all 0), largest remainder first, ties in pool order. Never gives anyone more
 * than their weight × amount / Σweights rounded up, so taking `amount ≤ Σweights`
 * never takes more than someone has.
 */
function apportion(amount: number, pool: readonly string[], weights: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  if (pool.length === 0 || amount <= 0) {
    for (const id of pool) out[id] = 0;
    return out;
  }
  const raw = pool.map((id) => Math.max(weights[id] ?? 0, 0));
  const sum = raw.reduce((a, w) => a + w, 0);
  const w = sum === 0 ? pool.map(() => 1) : raw;
  const total = BigInt(sum === 0 ? pool.length : sum);
  const big = BigInt(amount);
  const parts = pool.map((id, rank) => {
    const scaled = big * BigInt(w[rank]!);
    return { id, rank, floor: Number(scaled / total), remainder: scaled % total };
  });
  let leftover = amount - parts.reduce((a, p) => a + p.floor, 0);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.rank - b.rank : a.remainder > b.remainder ? -1 : 1,
  );
  for (const p of parts) out[p.id] = p.floor;
  for (const p of byRemainder) {
    if (leftover === 0) break;
    out[p.id]! += 1;
    leftover -= 1;
  }
  return out;
}

function markTouched(touched: readonly string[], id: string): string[] {
  return [...touched.filter((t) => t !== id), id];
}

/** Set `id` to `value` (clamped to 0…total) and rebalance the rest (see the top of the file). */
export function moveSlider(state: SliderState, id: string, value: number): SliderState {
  return move(state, id, value, true);
}

function move(state: SliderState, id: string, value: number, touch: boolean): SliderState {
  const { ids, total } = state;
  if (!ids.includes(id)) return state;
  const others = ids.filter((o) => o !== id);
  const touched = touch ? markTouched(state.touched, id) : state.touched;
  // One person always holds the whole total.
  if (others.length === 0) return { ...state, values: { [id]: total }, touched };
  const current = state.values[id] ?? 0;
  const target = clamp(Math.round(value), 0, total);
  const delta = target - current;
  if (delta === 0) return { ...state, touched };

  const values: Record<string, number> = { ...state.values, [id]: target };
  const handled = new Set(state.touched);
  const untouched = others.filter((o) => !handled.has(o));
  // Least recently touched first — the last one touched gives way last.
  const byAge = state.touched.filter((o) => o !== id && others.includes(o));

  if (delta > 0) {
    let need = delta;
    const available = untouched.reduce((a, o) => a + (values[o] ?? 0), 0);
    const fromUntouched = Math.min(need, available);
    if (fromUntouched > 0) {
      const taken = apportion(fromUntouched, untouched, values);
      for (const o of untouched) values[o] = (values[o] ?? 0) - (taken[o] ?? 0);
      need -= fromUntouched;
    }
    for (const o of byAge) {
      if (need === 0) break;
      const take = Math.min(need, values[o] ?? 0);
      values[o] = (values[o] ?? 0) - take;
      need -= take;
    }
    // `target ≤ total` means the others always had enough; anything left
    // (only if `state` didn't add up to begin with) comes off the target.
    if (need > 0) values[id] = target - need;
  } else {
    const give = -delta;
    if (untouched.length > 0) {
      const given = apportion(give, untouched, values);
      for (const o of untouched) values[o] = (values[o] ?? 0) + (given[o] ?? 0);
    } else {
      const oldest = byAge[0] ?? others[0]!;
      values[oldest] = (values[oldest] ?? 0) + give;
    }
  }
  return { ids: [...ids], values, total, touched };
}

/**
 * A new total (the amount was edited): everyone keeps their proportion. From
 * nothing (or to a state with nobody), it starts even.
 */
export function rescaleSliders(state: SliderState, total: number, leftoverOrder?: readonly string[]): SliderState {
  const next = Math.max(Math.floor(total), 0);
  if (next === state.total) return state;
  const sum = state.ids.reduce((a, id) => a + (state.values[id] ?? 0), 0);
  if (state.ids.length === 0 || sum === 0) return evenSliders(state.ids, next, leftoverOrder);
  return { ids: [...state.ids], values: apportion(next, state.ids, state.values), total: next, touched: state.touched };
}

/**
 * Someone ticked or unticked. Nothing adjusted yet: start even again.
 * Otherwise whoever left hands their units back as if their slider went to 0,
 * and a newcomer takes an even share as if theirs was moved up to it — neither
 * counts as a touch.
 */
export function withPeople(state: SliderState, ids: readonly string[], leftoverOrder?: readonly string[]): SliderState {
  const sameSet = ids.length === state.ids.length && ids.every((id) => state.ids.includes(id));
  if (sameSet) return ids.every((id, i) => state.ids[i] === id) ? state : { ...state, ids: [...ids] };
  if (state.touched.length === 0 || state.ids.length === 0 || ids.length === 0) {
    return evenSliders(ids, state.total, leftoverOrder);
  }
  let next: SliderState = state;
  for (const gone of state.ids.filter((id) => !ids.includes(id))) {
    next = move(next, gone, 0, false);
    const values = Object.fromEntries(Object.entries(next.values).filter(([id]) => id !== gone));
    next = {
      ids: next.ids.filter((id) => id !== gone),
      values,
      total: next.total,
      touched: next.touched.filter((id) => id !== gone),
    };
  }
  if (next.ids.length === 0) return evenSliders(ids, state.total, leftoverOrder);
  for (const fresh of ids.filter((id) => !next.ids.includes(id))) {
    next = { ...next, ids: [...next.ids, fresh], values: { ...next.values, [fresh]: 0 } };
    next = move(next, fresh, Math.floor(next.total / next.ids.length), false);
  }
  // Display order as given.
  return { ...next, ids: [...ids] };
}

/**
 * Bring a stored state up to date with who's in and the total, without losing
 * adjustments — what a component calls each render before showing sliders.
 */
export function syncSliders(
  state: SliderState | null,
  ids: readonly string[],
  total: number,
  leftoverOrder?: readonly string[],
): SliderState {
  if (!state) return evenSliders(ids, total, leftoverOrder);
  const rescaled = rescaleSliders(state, total, leftoverOrder);
  return withPeople(rescaled, ids, leftoverOrder);
}

/**
 * Where a dragged (or End-key) value lands: Radix snaps to multiples of the
 * step, so with a total that isn't one (₹1,201 in ₹5 steps) the far end would
 * stop short at ₹1,200. Anything within a step of the total is the total.
 */
export function snapToTotal(value: number, total: number, step: number): number {
  return total - value < step ? total : value;
}

/**
 * A step that gives a slider about 100–200 positions in "round" units (1, 2
 * or 5 × 10ⁿ) — so dragging or arrow keys land on tidy numbers. The values
 * rebalancing produces needn't sit on it.
 */
export function sliderStep(total: number, positions = 100): number {
  if (total <= positions) return 1;
  const raw = total / positions;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const m of [5, 2, 1]) {
    if (m * magnitude <= raw) return m * magnitude;
  }
  return Math.max(1, magnitude);
}
