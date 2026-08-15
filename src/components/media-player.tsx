"use client";

import { useState, type ReactNode } from "react";

/**
 * A `<video>`/`<audio>` element that swaps in `fallback` when the browser
 * refuses the file.
 *
 * Whether a given file plays is the browser's call, not ours — Chrome decodes
 * Matroska and Safari doesn't, Safari handles more QuickTime variants — so the
 * vault offers every container to the element rather than blocking a format
 * for everyone because one engine can't read it. That only degrades kindly if
 * the refusal is caught: `onError` fires once no source is usable, and without
 * it the user is left with a crossed-out play button and no explanation.
 *
 * Shared by the in-app viewer and the public share page so the recipient of a
 * link — the one person who can't retry somewhere else — gets the same
 * explanation the app gives. Callers own the surrounding layout and the
 * fallback, since one has a download card with viewer chrome and the other has
 * a share page that may not offer a download at all.
 */
export function MediaPlayer({
  src,
  kind,
  className,
  autoPlay = false,
  fallback,
}: {
  src: string;
  kind: "video" | "audio";
  className?: string;
  autoPlay?: boolean;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;

  if (kind === "audio") {
    return (
      <audio
        src={src}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className={className}
      />
    );
  }
  return (
    <video
      src={src}
      controls
      autoPlay={autoPlay}
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
