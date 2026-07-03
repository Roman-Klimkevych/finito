import { createTRPCRouter, publicProcedure } from "../trpc";
import { employees } from "../../db/schema";

export const employeeRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.db.select().from(employees);
  }),
});
