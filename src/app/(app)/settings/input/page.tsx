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
          {/* The "Unavailable on mobile" badge lives on the Normal option
              itself (see `ComposerDensityForm`) — that's the thing that's
              actually unavailable, and putting it there means the user reads it
              exactly where they'd otherwise tap. */}
          <CardTitle>Composer density</CardTitle>
          <CardDescription>
            Choose how much room the composer’s controls take. Applies to every
            profile and workspace, on any device you sign in from.{" "}
            <span className="md:hidden">
              Phones always use <strong className="font-medium">Compact</strong> —
              Normal spends a second row on the category slider, which is
              desktop-only — so this setting changes what you see on a larger
              screen, not here.
            </span>
            <span className="hidden md:inline">
              Phones always use Compact regardless of what you pick here.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComposerDensityForm density={uiPrefs.composer.density} />
        </CardContent>
      </Card>
    </div>
  );
}
