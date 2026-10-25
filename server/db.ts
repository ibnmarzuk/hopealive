import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!_db && connectionString) {
    try {
      const client = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 10 });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
