import { createTRPCRouter, publicProcedure } from "../trpc";
import { paymentCategories } from "../../db/schema";

export const categoryRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.db.select().from(paymentCategories);
  }),
});
