import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getTagsWithUsage } from "@/lib/queries";
import { sharedListAccess } from "@/lib/workspaces";
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
  const { user, workspace } = await getAppContext();
  const tags = await getTagsWithUsage(workspace.id);
  // Adding needs edit access to some profile; renaming or deleting (which
  // reaches every transaction) needs admin or edit access to every profile.
  const { canAdd, canEdit } = await sharedListAccess(user.id, workspace.id);

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
        <TagManager tags={tags} canAdd={canAdd} canEdit={canEdit} />
      </CardContent>
    </Card>
  );
}
