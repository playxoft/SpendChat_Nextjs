import type { Metadata } from "next";
import { getUserSettings, requireUser } from "@/lib/auth";
import { InputSettings } from "@/components/app/input-settings";
import { normalizeUiPrefs, type InputMode } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Input settings",
  robots: { index: false, follow: false },
};

export default async function InputSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const uiPrefs = normalizeUiPrefs(settings.uiPrefs);

  // Both cards live in one client component: their previews render the same
  // composer, so each has to know what the other is currently set to.
  return (
    <InputSettings
      inputMode={settings.inputMode as InputMode}
      density={uiPrefs.composer.density}
    />
  );
}
