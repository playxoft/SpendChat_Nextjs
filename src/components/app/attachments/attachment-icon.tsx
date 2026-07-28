import type { ReactNode } from "react";
import {
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  ImageIcon,
} from "lucide-react";

/**
 * A neutral file-type glyph for a content type, returned as an element (not a
 * component) so callers can drop it straight into JSX without tripping the
 * "component created during render" lint. Color is never the only signal — the
 * type label always sits alongside it. Shared by the tile, chips, and viewer.
 */
export function attachmentGlyph(contentType: string, className = "size-5"): ReactNode {
  if (contentType.startsWith("image/")) return <ImageIcon className={className} aria-hidden />;
  if (
    contentType === "text/csv" ||
    contentType.includes("spreadsheet") ||
    contentType === "application/vnd.ms-excel"
  ) {
    return <FileSpreadsheet className={className} aria-hidden />;
  }
  if (
    contentType === "application/pdf" ||
    contentType.startsWith("text/") ||
    contentType.includes("word") ||
    contentType === "application/msword"
  ) {
    return <FileText className={className} aria-hidden />;
  }
  return <FileIcon className={className} aria-hidden />;
}
