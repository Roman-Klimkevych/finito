import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { db } from "../db";

export function createTRPCContext() {
  return { db };
}

export type TRPCContext = ReturnType<typeof createTRPCContext>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
// Used by tests to invoke procedures in-process with an injected context (db).
export const createCallerFactory = t.createCallerFactory;
