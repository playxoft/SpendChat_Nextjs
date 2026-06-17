import { StackShell } from "@/components/stack-shell";

export const dynamic = "force-dynamic";

export default function HandlerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <StackShell>{children}</StackShell>;
}
