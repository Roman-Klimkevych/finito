import "server-only";
import { createTRPCContext } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

export const api = appRouter.createCaller(createTRPCContext());
