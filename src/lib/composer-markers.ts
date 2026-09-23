/**
 * The two inline markers the composer and the AI note both watch for: `/` for a
 * category and `#` for a tag, each matched as a token anchored to the *end* of
 * what has been typed so far.
 *
 * They live here rather than in the two components because there were two
 * copies of each, and they drifted: the tag one lost its digit guard in one
 * file and kept it in the other, which is the sort of difference nothing
 * notices until someone types a flight number.
 *
 * Anchoring to the end is what makes at most one picker open at a time, and
 * what makes "type the name, then pick" work — the token grows as you type and
 * the picker filters on it.
 */

/**
 * A trailing `/query`. The slash must start the string or follow whitespace,
 * which is what keeps `12/05` (a date) and `1/2` (a fraction) from opening the
 * picker mid-number — the same rule the AI prompt states.
 */
export const CATEGORY_MARKER_RE = /(?:^|\s)\/([^\s/]*)$/;

/**
 * A trailing `#query`, with one extra rule: the character after the hash must
 * not be a digit. `#1 priority` and `flight #204` are not tags, and the API
 * contract publishes that. Without the guard the picker opened on a flight
 * number — and because an open picker answers for Enter, the key offered to
 * create a tag named "204" instead of sending the transaction.
 *
 * A bare `#` still matches: that is "show me the tags".
 */
export const TAG_MARKER_RE = /(?:^|\s)#(?![0-9])([^\s#]*)$/;
