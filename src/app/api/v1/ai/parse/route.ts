import type { NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, parseOrThrow, readJson } from "@/lib/api-response";
import { badRequest, forbidden } from "@/lib/errors";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { assertAiRequestAllowed } from "@/lib/ai-quota";
import { MAX_INPUT_CHARS, parseTransactionsText } from "@/lib/ai-parse";
import { getCategories, getTags } from "@/lib/queries";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/timezone";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/parse — turn a free-text note into reviewable transaction
 * drafts. The mobile analogue of the composer's AI mode: nothing is written
 * here; the client shows the drafts for review and commits the kept ones via
 * `POST /transactions/bulk`. `timezone` (IANA) anchors "today" for relative
 * dates like "yesterday"; without it the drafts default to the UTC date.
 *
 * Gated exactly like the web action, and in the same order: cheap local checks,
 * then the editor role, then the per-user hourly AI quota — a denied caller
 * must never burn another caller's budget or reach a paid provider.
 */
const parseBodySchema = z.object({
  text: z.string(),
  timezone: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = parseOrThrow(parseBodySchema, await readJson(request));

    const note = body.text.trim();
    if (!note) throw badRequest("Type a note for the AI to turn into transactions");
    if (note.length > MAX_INPUT_CHARS) {
      throw badRequest(`That's a lot of text — keep it under ${MAX_INPUT_CHARS} characters`);
    }
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      throw badRequest("Invalid timezone — send an IANA name like Asia/Kolkata");
    }
    if (!(await canWriteInWorkspace(user.id, workspace.id))) {
      throw forbidden("You don't have permission to add transactions in this workspace");
    }
    await assertAiRequestAllowed(user.id, workspace.id, "transaction_parse");

    const today = todayISO(body.timezone ?? DEFAULT_TIME_ZONE);
    const [categories, tags] = await Promise.all([
      getCategories(workspace.id),
      getTags(workspace.id),
    ]);
    const drafts = await parseTransactionsText({
      text: note,
      categories: categories.map((c) => ({ name: c.name, kind: c.kind })),
      tags: tags.map((t) => t.name),
      currency: workspace.currency,
      locale: workspace.locale,
      today,
    });

    // The model resolves category *names*; hand the client the matching ids so
    // committing via /transactions/bulk needs no client-side name lookup.
    const idByKindAndName = new Map(categories.map((c) => [`${c.kind}:${c.name}`, c.id]));
    // Tag ids too, for the same reason: the model answers in names and
    // `/transactions/bulk` takes ids, so the lookup belongs here rather than in
    // every client.
    const tagIdByName = new Map(tags.map((t) => [t.name, t.id]));
    return apiOk({
      drafts: drafts.map((d) => ({
        type: d.type,
        amount: d.amount,
        title: d.title,
        description: d.description ?? null,
        categoryId: d.categoryName ? (idByKindAndName.get(`${d.type}:${d.categoryName}`) ?? null) : null,
        categoryName: d.categoryName,
        tagIds: d.tagNames.map((n) => tagIdByName.get(n)).filter((id): id is string => !!id),
        tagNames: d.tagNames,
        occurredOn: d.occurredOn,
      })),
      today,
    });
  });
}
