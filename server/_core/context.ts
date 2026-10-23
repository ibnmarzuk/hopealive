import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { readAdminSession } from "./adminAuth";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** Set when a valid email/password admin session cookie is present. */
  admin: { email: string } | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Independent of the Manus session: a credential-based admin cookie also
  // grants admin access. Never throws — a bad cookie just means "not an admin".
  let admin: { email: string } | null = null;
  try {
    admin = await readAdminSession(opts.req);
  } catch {
    admin = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    admin,
  };
}
