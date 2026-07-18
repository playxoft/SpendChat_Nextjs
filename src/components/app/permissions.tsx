"use client";

import * as React from "react";

/**
 * Current user's coarse permissions in the active workspace, resolved once on
 * the server (in the app layout) and shared with deep client components so they
 * can hide controls a viewer can't use. The server still enforces every
 * mutation — this only keeps dead buttons off the screen.
 *
 * - `canWrite`  — editor+ on at least one profile (add/edit/delete transactions).
 * - `canManage` — workspace admin (create/edit/delete profiles, workspace settings).
 */
export type Permissions = { canWrite: boolean; canManage: boolean };

// Permissive defaults so components rendered outside a provider (e.g. the
// marketing demo) behave normally.
const PermissionsContext = React.createContext<Permissions>({ canWrite: true, canManage: false });

export function PermissionsProvider({
  canWrite,
  canManage,
  children,
}: Permissions & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ canWrite, canManage }), [canWrite, canManage]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): Permissions {
  return React.useContext(PermissionsContext);
}
