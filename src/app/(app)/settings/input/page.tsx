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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Input settings",
  robots: { index: false, follow: false },
};

export default async function InputSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);

  return (
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
  );
}
