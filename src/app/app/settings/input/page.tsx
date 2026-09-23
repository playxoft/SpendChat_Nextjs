import type { Metadata } from "next";
import { getAppContext, getUserSettings } from "@/lib/auth";
import { getCurrency } from "@/lib/currencies";
import { todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { InputSettings } from "@/components/app/input-settings";
import { normalizeUiPrefs, type InputMode } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Input settings",
  robots: { index: false, follow: false },
};

export default async function InputSettingsPage() {
  const { user, workspace } = await getAppContext();
  const settings = await getUserSettings(user.id);
  const uiPrefs = normalizeUiPrefs(settings.uiPrefs);

  // Both cards live in one client component: their previews render the same
  // composer, so each has to know what the other is currently set to — and
  // both need the workspace's own currency, locale and today, or the preview
  // shows a composer nobody here has.
  return (
    <InputSettings
      inputMode={settings.inputMode as InputMode}
      density={uiPrefs.composer.density}
      preview={{
        symbol: getCurrency(workspace.currency).symbol,
        locale: workspace.locale,
        today: todayISO(await getTimeZone()),
      }}
    />
  );
}
