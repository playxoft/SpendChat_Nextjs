import { redirect } from "next/navigation";

// The settings home is the Account section; each section is its own route
// under the shared secondary-nav layout.
export default function SettingsPage() {
  redirect("/settings/account");
}
