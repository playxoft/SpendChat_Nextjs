import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Provided by Doppler at runtime: `doppler run -- pnpm db:migrate`
    url: process.env.NEON_POSTGRES_DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
