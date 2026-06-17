"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/** Browser auth client — talks to the same-origin `/api/auth` route. */
export const authClient = createAuthClient();
