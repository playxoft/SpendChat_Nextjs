import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Neon Auth server instance (proxies auth requests to Neon).
 * - NEON_AUTH_BASE_URL: the Auth URL from the Neon console (Project → Auth → Configuration)
 * - NEON_AUTH_COOKIE_SECRET: a 32+ char secret (e.g. `openssl rand -base64 32`)
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
