import { ProfileSwitcher } from "spendchat";

const PROFILES = [
  { id: "p1", name: "Personal", icon: "🏠" },
  { id: "p2", name: "Household", icon: "👨‍👩‍👧" },
  { id: "p3", name: "Business", icon: "💼" },
];

export function OneProfile() {
  return (
    <div className="w-full max-w-sm">
      <ProfileSwitcher profiles={PROFILES} filterProfileId="p1" allProfiles={false} />
    </div>
  );
}

export function AllProfiles() {
  return (
    <div className="w-full max-w-sm">
      <ProfileSwitcher profiles={PROFILES} allProfiles />
    </div>
  );
}
