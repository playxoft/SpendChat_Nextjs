import type { Metadata } from "next";
import { getUserSettings, requireUser } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InputModeForm } from "@/components/app/input-mode-form";
import { ComposerDensityForm } from "@/components/app/composer-density-form";
import { normalizeUiPrefs } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Input settings",
  robots: { index: false, follow: false },
};

export default async function InputSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);

  const uiPrefs = normalizeUiPrefs(settings.uiPrefs);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Transaction input</CardTitle>
          <CardDescription>
            Choose how the composer at the bottom of the tracker lays out its fields
            when you add a transaction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InputModeForm inputMode={settings.inputMode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Composer density</CardTitle>
          <CardDescription>
            Choose how much room the composer’s controls take. Applies to every
            profile and workspace, on any device you sign in from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComposerDensityForm density={uiPrefs.composer.density} />
        </CardContent>
      </Card>
    </div>
  );
}
