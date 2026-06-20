import type { Metadata } from "next";
import { getUserSettings, requireUser } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsForm } from "@/components/app/settings-form";
import { CategoryManager } from "@/components/app/category-manager";
import { ShortcutList } from "@/components/app/shortcut-list";
import { DangerZone } from "@/components/app/danger-zone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const categories = await getCategories(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Currency, number format, and theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            currency={settings.currency}
            locale={settings.locale}
            theme={settings.theme}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Organize your income and expenses. Deleting a category leaves its
            transactions uncategorized.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryManager categories={categories} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keyboard shortcuts</CardTitle>
          <CardDescription>Work faster with these shortcuts.</CardDescription>
        </CardHeader>
        <CardContent>
          <ShortcutList />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Irreversible actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <DangerZone />
        </CardContent>
      </Card>
    </div>
  );
}
