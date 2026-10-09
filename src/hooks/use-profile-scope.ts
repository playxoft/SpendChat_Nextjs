"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  parseProfileScope,
  resolveProfileScope,
  type ProfileScope,
  type ResolvedScope,
  type ScopeProfile,
} from "@/lib/profile-scope";

/**
 * The profile selection in the URL (`?profile=`), read the way the pages read
 * it: `raw` is the parameter as it stands (what `hrefWithProfile` carries),
 * `scope` what it asks for, `resolved` what that comes to over `profiles` —
 * the same list, in the same order, that the server resolved it against.
 */
export function useProfileScope(profiles: readonly ScopeProfile[]): {
  raw: string | null;
  scope: ProfileScope;
  resolved: ResolvedScope;
} {
  const raw = useSearchParams().get("profile");
  return useMemo(() => {
    const scope = parseProfileScope(raw);
    return { raw, scope, resolved: resolveProfileScope(scope, profiles) };
  }, [raw, profiles]);
}
