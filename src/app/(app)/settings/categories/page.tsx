import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
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
  const user = await requireUser();
  const categories = await getCategories(user.id);

  return (
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
  );
}
