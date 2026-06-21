import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteNav />
      {/* pt clears the fixed top capsule nav; the hero subtracts it to stay full-height. */}
      <main className="flex-1 pt-20">{children}</main>
      <SiteFooter />
    </div>
  );
}
