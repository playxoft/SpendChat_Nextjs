import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { atLeastRole } from "@/lib/rbac";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryManager } from "@/components/app/category-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Category settings",
  robots: { index: false, follow: false },
};

export default async function CategorySettingsPage() {
  const { workspace } = await getAppContext();
  const categories = await getCategories(workspace.id);
  // Editors and admins manage the shared list; viewers see it read-only.
  const canEdit = atLeastRole(workspace.role, "editor");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>
          Shared by everyone in this workspace. Deleting a category leaves its
          transactions uncategorized.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CategoryManager categories={categories} canEdit={canEdit} />
      </CardContent>
    </Card>
  );
}
