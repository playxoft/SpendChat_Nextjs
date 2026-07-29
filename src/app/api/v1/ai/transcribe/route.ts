import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { badRequest, forbidden } from "@/lib/errors";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { assertAiRequestAllowed } from "@/lib/ai-quota";
import { MAX_AUDIO_BYTES } from "@/lib/ai-limits";
import { transcribeVoiceNote } from "@/lib/ai-transcribe";
import { getCategories } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/transcribe — turn a recorded voice note into the text of a
 * note. The mobile analogue of the composer's hold-to-talk mic: it returns only
 * a transcript, which the user reviews/edits and then sends through
 * `POST /ai/parse` exactly like a typed note. Audio is transcribed and
 * discarded — nothing is stored.
 *
 * Request: multipart form data with the recording under `audio` (an optional
 * `mimeType` field is a fallback for clients whose upload part drops the
 * content type). The languages the model is told to expect come from the
 * caller's `voiceLanguages` setting.
 *
 * Gated exactly like `/ai/parse` and in the same order: cheap local checks
 * (format, size), then the editor role, then the shared hourly AI quota.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, settings, workspace } = await getApiContext(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("Send the recording as multipart form data");
    }
    const audio = form.get("audio") ?? form.get("file");
    if (!(audio instanceof Blob) || audio.size === 0) {
      throw badRequest("No recording was captured — try again.");
    }
    // Reject an oversized upload before it's read into memory or costed.
    if (audio.size > MAX_AUDIO_BYTES) {
      throw badRequest("That recording is too long — try a shorter one.");
    }
    const mimeType = audio.type || String(form.get("mimeType") ?? "");
    if (!mimeType) throw badRequest("No recording was captured — try again.");

    if (!(await canWriteInWorkspace(user.id, workspace.id))) {
      throw forbidden("You don't have permission to add transactions in this workspace");
    }
    await assertAiRequestAllowed(user.id, workspace.id, "voice_transcribe");

    const categories = await getCategories(workspace.id);
    const text = await transcribeVoiceNote({
      audio: { bytes: new Uint8Array(await audio.arrayBuffer()), mimeType },
      languages: settings.voiceLanguages,
      currency: workspace.currency,
      categoryNames: categories.map((c) => c.name),
    });
    return apiOk({ text });
  });
}
