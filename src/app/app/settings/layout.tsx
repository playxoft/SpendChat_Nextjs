import { SettingsNav } from "@/components/app/settings-nav";

export const dynamic = "force-dynamic";

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto max-w-[67.2rem] px-4 py-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      {/* Stack the section nav on top (mobile-style scroll row) up to `lg`, so
          tablets — where the main app sidebar already claims width — aren't
          squeezed by a second left rail. The rail returns on desktop. */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:gap-8">
        <SettingsNav />
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </div>
  );
}
