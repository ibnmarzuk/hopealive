// Keep Drizzle migrations on Neon's direct connection. Application traffic uses the pooled DATABASE_URL.
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql" as const,
  ...(connectionString ? { dbCredentials: { url: connectionString } } : {}),
};
