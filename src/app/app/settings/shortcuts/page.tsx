import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShortcutList } from "@/components/app/shortcut-list";

export const metadata: Metadata = {
  title: "Keyboard shortcuts",
  robots: { index: false, follow: false },
};

export default function ShortcutSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Keyboard shortcuts</CardTitle>
        <CardDescription>Work faster with these shortcuts.</CardDescription>
      </CardHeader>
      <CardContent>
        <ShortcutList />
      </CardContent>
    </Card>
  );
}
