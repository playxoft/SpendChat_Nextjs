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
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-lg border">
      <style>{`@media (min-width:48rem){[data-ds-phone-frame] header{display:flex!important}}`}</style>
      <div data-ds-phone-frame>{children}</div>
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
