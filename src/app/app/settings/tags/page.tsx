import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getTagsWithUsage } from "@/lib/queries";
import { atLeastRole } from "@/lib/rbac";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TagManager } from "@/components/app/tag-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tag settings",
  robots: { index: false, follow: false },
};

export default async function TagSettingsPage() {
  const { workspace } = await getAppContext();
  const tags = await getTagsWithUsage(workspace.id);
  // Editors and admins manage the shared list; viewers see it read-only.
  const canEdit = atLeastRole(workspace.role, "editor");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <CardDescription>
          Shared by everyone in this workspace. Renaming or recoloring a tag
          updates every transaction carrying it; deleting one detaches it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TagManager tags={tags} canEdit={canEdit} />
      </CardContent>
    </Card>
  );
}
