import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { sharedListAccess } from "@/lib/workspaces";
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
  const { user, workspace } = await getAppContext();
  const categories = await getCategories(workspace.id);
  // Adding needs edit access to some profile; renaming or deleting (which
  // reaches every transaction) needs admin or edit access to every profile.
  const { canAdd, canEdit } = await sharedListAccess(user.id, workspace.id);

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
        <CategoryManager categories={categories} canAdd={canAdd} canEdit={canEdit} />
      </CardContent>
    </Card>
  );
}
