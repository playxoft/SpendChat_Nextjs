import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { sharePath, type FileShareDTO } from "@/lib/files";
import { createFileShare, listFileShares } from "@/services/files";

export const dynamic = "force-dynamic";

/** The DTO plus the public web path the token opens (`/share/<token>`) — the
 * client prefixes the web origin to build a shareable link. */
const withSharePath = (share: FileShareDTO) => ({ ...share, sharePath: sharePath(share.token) });

/**
 * GET /api/v1/file-shares — active share links for one file or folder
 * (`?fileId=` or `?folderId=`, exactly one), newest first. Editor only —
 * tokens grant public access, so viewers don't get to read them.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const sp = new URL(request.url).searchParams;
    const shares = await listFileShares(user.id, workspace.id, {
      fileId: sp.get("fileId") ?? undefined,
      folderId: sp.get("folderId") ?? undefined,
    });
    return apiOk(shares.map(withSharePath));
  });
}

/**
 * POST /api/v1/file-shares — create a public share link for one file or folder
 * (editor only). Body `{ fileId? | folderId?, allowDownload?, expiresInDays? }`
 * — exactly one target; `allowDownload: false` makes a view-only link;
 * `expiresInDays` omitted/null means the link never expires. The predefined
 * "Transaction attachments" folder can't be shared (400). The token IS the
 * capability — anyone with the link sees the content.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createFileShare(user.id, workspace.id, body);
    return apiOk(withSharePath(created), 201);
  });
}
