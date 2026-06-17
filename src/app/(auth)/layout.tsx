import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { StackShell } from "@/components/stack-shell";

export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <StackShell>
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <Link href="/" aria-label="Back to home">
            <Logo />
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </StackShell>
  );
}
