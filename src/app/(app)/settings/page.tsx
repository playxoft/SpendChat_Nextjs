import { redirect } from "next/navigation";

// The settings home is the Account section; each section is its own route
// under the shared secondary-nav layout. Preserve `?profile=` across the
// redirect so landing on settings never resets the selected profile.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const profile = Array.isArray(sp.profile) ? sp.profile[0] : sp.profile;
  redirect(profile ? `/settings/account?profile=${encodeURIComponent(profile)}` : "/settings/account");
}
