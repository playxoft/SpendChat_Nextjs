"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";

/**
 * Wraps a page so dropping files anywhere on it triggers `onFiles` (the caller
 * opens the add flow / stages the files). Shows a full-screen "drop to attach"
 * overlay only while files are actually being dragged over the window — a
 * `dragenter`/`dragleave` depth counter keeps it steady as the pointer crosses
 * child elements. Ignores non-file drags (text, elements) so it never flashes.
 */
export function PageAttachmentDrop({
  onFiles,
  disabled = false,
  label = "Drop to add a transaction",
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  /** Optional page content to wrap; omit to mount just the window listeners + overlay. */
  children?: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const cb = useRef(onFiles);
  // Keep the latest callback without re-subscribing the window listeners.
  useEffect(() => {
    cb.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    if (disabled) return;
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) cb.current(files);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [disabled]);

  return (
    <>
      {children}
      {dragging ? (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/50 bg-card px-10 py-8 text-center shadow-lg">
            <Upload className="size-7 text-foreground" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">
                Images, PDF, Word, Excel · up to 5 MB each
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
