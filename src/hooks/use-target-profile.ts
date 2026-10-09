"use client";

import { useCallback, useState } from "react";
import { composerTarget } from "@/lib/profile-scope";

/**
 * Where the composer saves to: the view's default profile, or the one picked
 * from its profile menu — re-seeded whenever the view changes underneath it
 * (see `composerTarget`). Adjusted during render rather than in an effect, so
 * no render ever sends to the previous view's profile.
 */
export function useTargetProfile(
  activeProfileId: string | undefined,
  choices: readonly { id: string }[],
): [string, (id: string) => void] {
  const [state, setState] = useState(() => ({
    profileId: activeProfileId ?? choices[0]?.id ?? "",
    seededFrom: activeProfileId,
  }));
  const profileId = composerTarget(state.profileId, state.seededFrom, activeProfileId, choices);
  if (profileId !== state.profileId || state.seededFrom !== activeProfileId) {
    setState({ profileId, seededFrom: activeProfileId });
  }
  const pick = useCallback((id: string) => setState((s) => ({ ...s, profileId: id })), []);
  return [profileId, pick];
}
