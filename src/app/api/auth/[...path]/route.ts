import { auth } from "@/lib/neon-auth";

export const dynamic = "force-dynamic";

export const { GET, POST } = auth.handler();
