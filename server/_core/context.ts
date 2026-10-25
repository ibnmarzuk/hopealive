import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { readAdminSession } from "./adminAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** Set when a valid email/password admin session cookie is present. */
  admin: { email: string; role: "superadmin" | "subadmin" } | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const admin = await readAdminSession(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    admin,
  };
}
