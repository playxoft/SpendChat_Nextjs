import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare adapter config.
 * Defaults are fine for this app. Add an R2/KV incremental cache here later if
 * ISR/cached fetches are introduced.
 */
export default defineCloudflareConfig({});
