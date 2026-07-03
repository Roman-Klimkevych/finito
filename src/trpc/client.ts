"use client";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/api/root";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
});
