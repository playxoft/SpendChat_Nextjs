import type { Metadata } from "next";
import { getUserSettings, requireUser } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeForm } from "@/components/app/theme-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Theme settings",
  robots: { index: false, follow: false },
};

export default async function ThemeSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>How SpendChat looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeForm theme={settings.theme} />
      </CardContent>
    </Card>
  );
}
