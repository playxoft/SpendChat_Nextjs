import type { ReactNode } from "react";
import { AppTopbar } from "spendchat";

const PROFILES = [
  { id: "p1", name: "Personal", icon: "🏠" },
  { id: "p2", name: "Household", icon: "👨‍👩‍👧" },
];

const WORKSPACES = [
  { id: "w1", name: "Nitheesh's Workspace", icon: "🗂️", role: "admin" as const },
];

const CATEGORIES = [
  { id: "c1", name: "Groceries", icon: "🛒", kind: "expense" as const },
  { id: "c2", name: "Salary", icon: "💰", kind: "income" as const },
];

const BASE = {
  email: "nitheesh@example.com",
  profiles: PROFILES,
  workspaces: WORKSPACES,
  currentWorkspaceId: "w1",
  categories: CATEGORIES,
  currency: "INR",
  locale: "en-IN",
  today: "2026-10-16",
};

// The mobile counterpart to AppSidebar. The header is `md:hidden`, so at the
// 1200px capture width it collapses to 2px; the scoped rule below re-shows it
// inside this phone frame. The component itself is untouched.
//
// The frame attribute is card-specific (`data-ds-topbar-frame`, vs
// `data-ds-bottomnav-frame` in BottomNav.tsx) because a <style> element's rules
// are document-global: on a sheet rendering both cards, one shared attribute
// would apply each card's `display:flex!important` inside the other's frame.
function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-lg border">
      <style>{`@media (min-width:48rem){[data-ds-topbar-frame] header{display:flex!important}}`}</style>
      <div data-ds-topbar-frame>{children}</div>
    </div>
  );
}

export function Editor() {
  return (
    <PhoneFrame>
      <AppTopbar {...BASE} canWrite />
    </PhoneFrame>
  );
}

export function Viewer() {
  return (
    <PhoneFrame>
      <AppTopbar {...BASE} canWrite={false} />
    </PhoneFrame>
  );
}
