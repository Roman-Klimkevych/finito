import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { dismissedChanges, paymentCategories, rateChanges } from "../../db/schema";
import { resolveEmployeeRates } from "../../rates/resolve";

// All temporal comparisons in the resolver are lexicographic string comparisons,
// so a well-formed YYYY-MM-DD is a correctness precondition, not just cosmetics.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected date as YYYY-MM-DD");

export const rateRouter = createTRPCRouter({
  listForEmployee: publicProcedure
    .input(
      z.object({
        employeeId: z.number().int(),
        asOf: isoDate,
      }),
    )
    .query(async ({ ctx, input }) => {
      const [categories, changes, cancelled] = await Promise.all([
        ctx.db.select().from(paymentCategories),
        ctx.db
          .select()
          .from(rateChanges)
          .where(eq(rateChanges.employeeId, input.employeeId)),
        ctx.db.select().from(dismissedChanges),
      ]);

      // A cancelled edit is gone from the timeline, so the panel reflects it too.
      const resolved = resolveEmployeeRates(changes, {
        asOf: input.asOf,
        dismissedChangeIds: new Set(cancelled.map((d) => d.rateChangeId)),
      });

      return categories.map((cat) => ({
        category: cat,
        amountCents: resolved.get(cat.id)?.amountCents ?? null,
        rateChangeId: resolved.get(cat.id)?.id ?? null,
      }));
    }),

  set: publicProcedure
    .input(
      z.object({
        employeeId: z.number().int(),
        categoryId: z.number().int(),
        effectiveDate: isoDate,
        amountCents: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [inserted] = await ctx.db
        .insert(rateChanges)
        .values({
          employeeId: input.employeeId,
          categoryId: input.categoryId,
          effectiveDate: input.effectiveDate,
          amountCents: input.amountCents,
        })
        .returning();
      return inserted;
    }),
});
