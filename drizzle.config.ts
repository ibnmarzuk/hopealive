// Plain object export (no `drizzle-kit` import) so the config loads even when
// drizzle-kit runs via npx without being installed in the project.
// `drizzle-kit generate` works offline; only migrate/push need a connection string.
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql" as const,
  ...(connectionString ? { dbCredentials: { url: connectionString } } : {}),
};
