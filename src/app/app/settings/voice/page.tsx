import type { Metadata } from "next";
import { getUserSettings, requireUser } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { VoiceLanguagesForm } from "@/components/app/voice-languages-form";
import { comboFor } from "@/lib/shortcuts";
import { normalizeVoiceLanguages } from "@/lib/voice-languages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Voice settings",
  robots: { index: false, follow: false },
};

export default async function VoiceSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Voice languages</CardTitle>
          <CardDescription>
            Which languages the mic should expect. Pick every language you speak
            while adding transactions — including mixing two in one sentence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoiceLanguagesForm languages={normalizeVoiceLanguages(settings.voiceLanguages)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How voice entry works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            In the tracker&rsquo;s <span className="text-foreground">AI</span> mode, hold the
            {/* `describe`: the chip *is* the instruction here, and its glyphs
                are `aria-hidden`, so the sentence otherwise reached a screen
                reader as "or hold — and say what you spent". */}
            mic button — or hold{" "}
            <Kbd combo={comboFor("tracker.voice")} className="align-middle" describe />{" "}
            — and say what you spent. Release to stop.
          </p>
          <p>
            What you said is added to the note as text so you can read it and fix
            anything misheard. Nothing is saved until you send the note and confirm
            the transactions it produced.
          </p>
          <p>
            Recordings are transcribed and then discarded — no audio is stored.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
