import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { badRequest, forbidden } from "@/lib/errors";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { chargeVoiceTranscribe, withAiCharge } from "@/lib/ai-quota";
import { assertVoiceAllowed } from "@/lib/entitlements";
import { MAX_AUDIO_BYTES } from "@/lib/ai-limits";
import { assertUploadBodySize } from "@/lib/upload-form";
import {
  isSupportedAudioType,
  parseClipDurationMs,
  transcribeVoiceNote,
} from "@/lib/ai-transcribe";
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
 * content type) and the clip length in milliseconds under `durationMs`. The
 * languages the model is told to expect come from the caller's
 * `voiceLanguages` setting.
 *
 * Voice is a plan feature (Pro, or a grandfathered workspace in its grace
 * period) and costs one AI action per started minute of the clip — `durationMs`,
 * clamped to two minutes; a request without it is charged for the full two.
 * That charge also covers parsing the transcript: send it to `/ai/parse` with
 * `source: "voice"`.
 *
 * Gated like `/ai/parse` and in the same order: cheap local checks (format,
 * size, declared length), then the editor role, then the voice plan gate
 * (403 `plan_limit`), then the AI charge (hourly cap → 429, monthly allowance
 * → 403 `plan_limit`).
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, settings, workspace } = await getApiContext(request);

    // Recordings are the largest bodies the product accepts, so this is the
    // first route that wants the early 413 — not the last one to get it.
    assertUploadBodySize(request, { maxFiles: 1, maxBytes: MAX_AUDIO_BYTES });

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
    // The header check above turns away an honestly-declared oversized body
    // before the read; this is the authoritative check on what actually
    // arrived, and it spares the `arrayBuffer()` copy, the quota slot and the
    // provider call.
    if (audio.size > MAX_AUDIO_BYTES) {
      throw badRequest("That recording is too long — try a shorter one.");
    }
    const mimeType = audio.type || String(form.get("mimeType") ?? "");
    if (!mimeType) throw badRequest("No recording was captured — try again.");
    // Container check belongs here, with the other cheap checks — not deeper in
    // `transcribeVoiceNote`, which runs past the quota gate and would let an
    // unsupported file burn a slot on its way to a guaranteed 400.
    if (!isSupportedAudioType(mimeType)) {
      throw badRequest("That audio format isn't supported — try recording again.");
    }
    const durationMs = parseClipDurationMs(form.get("durationMs"));

    if (!(await canWriteInWorkspace(user.id, workspace.id))) {
      throw forbidden("You don't have permission to add transactions in this workspace");
    }
    await assertVoiceAllowed(workspace.id);
    const charge = await chargeVoiceTranscribe(user.id, workspace.id, { durationMs });

    const text = await withAiCharge(charge, async (onUsage) => {
      const categories = await getCategories(workspace.id);
      return transcribeVoiceNote({
        audio: { bytes: new Uint8Array(await audio.arrayBuffer()), mimeType },
        languages: settings.voiceLanguages,
        currency: workspace.currency,
        categoryNames: categories.map((c) => c.name),
        onUsage,
      });
    });
    return apiOk({ text });
  });
}
