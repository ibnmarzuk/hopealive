import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.admin) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
    }

    return next({ ctx });
  }),
);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (ctx.admin?.role !== "superadmin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Super-admin access is required for this action." });
    }
    return next({ ctx });
  }),
);
