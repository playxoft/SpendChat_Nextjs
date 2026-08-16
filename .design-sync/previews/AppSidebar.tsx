import { AppSidebar } from "spendchat";

const PROFILES = [
  { id: "p1", name: "Personal", icon: "🏠" },
  { id: "p2", name: "Household", icon: "👨‍👩‍👧" },
  { id: "p3", name: "Business", icon: "💼" },
];

const WORKSPACES = [
  { id: "w1", name: "Nitheesh's Workspace", icon: "🗂️", role: "admin" as const },
  { id: "w2", name: "Household", icon: "🏡", role: "editor" as const },
];

// Sticky full-height rail, hidden below `md` — the card gives it a tall box.
export function Rail() {
  return (
    <div className="flex h-[520px] overflow-hidden rounded-lg border">
      <AppSidebar
        email="nitheesh@example.com"
        profiles={PROFILES}
        workspaces={WORKSPACES}
        currentWorkspaceId="w1"
      />
      <div className="flex-1 bg-muted/30" />
    </div>
  );
}
