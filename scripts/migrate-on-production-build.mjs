import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log("[Database] Skipping automatic migrations outside the production deployment.");
  process.exit(0);
}

const migrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!migrationUrl) {
  console.error("[Database] Production deployment is missing DATABASE_URL_UNPOOLED, DATABASE_URL or POSTGRES_URL.");
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: migrationUrl },
});

if (result.error) {
  console.error("[Database] Could not start Drizzle migrations:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
