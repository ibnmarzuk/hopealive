import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { getDb } from "./db";
import { registrations } from "../drizzle/schema";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ status: "unavailable", database: "not_configured" });
      await db.select({ id: registrations.id }).from(registrations).limit(1);
      return res.json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error("[Health] Database check failed:", error);
      return res.status(503).json({ status: "unavailable", database: "error" });
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}

export const app = createApp();
