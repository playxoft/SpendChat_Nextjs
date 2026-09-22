"use client";

import { useState } from "react";
import type { TxnTagDTO } from "@/lib/tags";

/**
 * The server list plus tags created locally that it doesn't carry yet.
 *
 * Pure, and exported on its own, because it is the part worth pinning: the
 * merge has to keep the *server* copy of an id (a rename made in another tab
 * must win over a stale local one) while still surfacing a tag the server
 * hasn't caught up on.
 */
export function mergeCreatedTags(server: TxnTagDTO[], created: TxnTagDTO[]): TxnTagDTO[] {
  if (created.length === 0) return server;
  const serverIds = new Set(server.map((t) => t.id));
  const extra = created.filter((t) => !serverIds.has(t.id));
  return extra.length ? [...server, ...extra] : server;
}

/**
 * Hold tags created from inside a picker until the server list catches up.
 *
 * Every surface that can create a tag mid-flow needs this: `tags` is a server
 * prop refreshed by the action's `revalidatePath`, so between "Create" and that
 * revalidation the new id resolves to nothing — the tag is applied but its chip
 * can't be rendered, which reads as the app having dropped it.
 *
 * The pruning half matters as much as the merge. Dropping a local tag the
 * moment the server list carries it is what stops it coming back from the dead:
 * hold it forever and filter only at read time, and the copy reappears the day
 * someone *deletes* the tag in another tab — offered as a pickable option that
 * the server then silently discards on save. Done during render rather than in
 * an effect, because `tags` arriving with the id *is* the signal.
 */
export function useCreatedTags(tags: TxnTagDTO[]) {
  const [created, setCreated] = useState<TxnTagDTO[]>([]);

  if (created.length > 0) {
    const serverIds = new Set(tags.map((t) => t.id));
    if (created.some((t) => serverIds.has(t.id))) {
      setCreated((prev) => prev.filter((t) => !serverIds.has(t.id)));
    }
  }

  return {
    /** The list to render and resolve ids against. */
    known: mergeCreatedTags(tags, created),
    add: (tag: TxnTagDTO) => setCreated((prev) => [...prev, tag]),
    /** Drop everything held locally — for a form that re-seeds on open. */
    reset: () => setCreated([]),
  };
}
