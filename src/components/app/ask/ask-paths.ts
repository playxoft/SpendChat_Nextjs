/**
 * Where Ask lives. A chat is a search param, not a path segment, on purpose:
 * moving between `/app/ask` and `/app/ask?c=…` stays on one route segment, so
 * starting a chat (the URL gains its id once the first answer is in) swaps the
 * page in place instead of flashing the route's loading skeleton over an answer
 * that is already on screen.
 */
export const ASK_PATH = "/app/ask";

/**
 * A chat's address (none = a new chat). `profile` rides along like it does on
 * every section link (`hrefWithProfile`): Ask reads every profile you can see,
 * but the tracker you go back to should still be on the one you picked.
 */
export function askHref({
  chatId,
  profile,
}: { chatId?: string | null; profile?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (chatId) q.set("c", chatId);
  if (profile) q.set("profile", profile);
  const query = q.toString();
  return query ? `${ASK_PATH}?${query}` : ASK_PATH;
}
