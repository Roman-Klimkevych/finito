import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import {
  dismissedChanges,
  employees,
  paymentCategories,
  payslipLines,
  payslips,
  rateChanges,
} from "../../db/schema";
import {
  nextChangeToDismiss,
  resolveEmployeeRates,
  resolveRateCents,
} from "../../rates/resolve";

// Resolver comparisons are lexicographic on the string, so the date must be a
// well-formed YYYY-MM-DD for resolution to be correct.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected date as YYYY-MM-DD");

export const payslipRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        employeeId: z.number().int(),
        date: isoDate, // the payslip's "worked" date
        lines: z
          .array(
            z.object({
              categoryId: z.number().int(),
              units: z.number().int().positive(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [changes, cancelled] = await Promise.all([
        ctx.db
          .select()
          .from(rateChanges)
          .where(eq(rateChanges.employeeId, input.employeeId)),
        ctx.db.select().from(dismissedChanges),
      ]);

      // A globally-cancelled edit is gone from the timeline, so a new payslip's
      // snapshot must ignore it too — the cancellation affects future payslips.
      const dismissedChangeIds = new Set(cancelled.map((d) => d.rateChangeId));

      const resolved = resolveEmployeeRates(changes, {
        asOf: input.date,
        dismissedChangeIds,
      });

      for (const line of input.lines) {
        if (!resolved.has(line.categoryId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `No rate found for category ${line.categoryId} as of ${input.date}. Set a rate before creating this payslip.`,
          });
        }
      }

      // One transaction: a payslip and its lines are created together or not at
      // all — a failure between the two inserts must not leave an empty payslip.
      // better-sqlite3 is synchronous, so the transaction callback must be sync
      // (it rejects a promise-returning function); use the .get()/.run() runners.
      const payslip = ctx.db.transaction((tx) => {
        const created = tx
          .insert(payslips)
          .values({
            employeeId: input.employeeId,
            date: input.date,
            createdByUserId: 1,
          })
          .returning()
          .get();

        tx.insert(payslipLines)
          .values(
            input.lines.map((line) => ({
              payslipId: created!.id,
              categoryId: line.categoryId,
              units: line.units,
              rateCentsAtCreation: resolved.get(line.categoryId)!.amountCents,
            })),
          )
          .run();

        return created!;
      });

      return payslip;
    }),

  list: publicProcedure.query(async ({ ctx }) => {
    // Bulk-fetch everything; compute totals in memory to avoid N+1 queries.
    const [allPayslips, allLines, allChanges, allDismissed, allEmployees, allCategories] =
      await Promise.all([
        ctx.db
          .select()
          .from(payslips)
          .orderBy(desc(payslips.date), desc(payslips.id)),
        ctx.db.select().from(payslipLines),
        ctx.db.select().from(rateChanges),
        ctx.db.select().from(dismissedChanges),
        ctx.db.select().from(employees),
        ctx.db.select().from(paymentCategories),
      ]);

    const employeeById = new Map(allEmployees.map((e) => [e.id, e]));
    const categoryById = new Map(allCategories.map((c) => [c.id, c]));

    // Group lines by payslip
    const linesByPayslip = new Map<number, typeof allLines>();
    for (const line of allLines) {
      const arr = linesByPayslip.get(line.payslipId) ?? [];
      arr.push(line);
      linesByPayslip.set(line.payslipId, arr);
    }

    // Group rate changes by (employeeId, categoryId) series key
    const changesBySeries = new Map<string, typeof allChanges>();
    for (const c of allChanges) {
      const key = `${c.employeeId}_${c.categoryId}`;
      const arr = changesBySeries.get(key) ?? [];
      arr.push(c);
      changesBySeries.set(key, arr);
    }

    // Group rate changes by employee for dismiss-candidate lookup
    const changesByEmployee = new Map<number, typeof allChanges>();
    for (const c of allChanges) {
      const arr = changesByEmployee.get(c.employeeId) ?? [];
      arr.push(c);
      changesByEmployee.set(c.employeeId, arr);
    }

    // Cancellation is global: one set of cancelled change ids shared by every
    // payslip and the rates panel.
    const dismissedIds = new Set(allDismissed.map((d) => d.rateChangeId));

    return allPayslips.map((payslip) => {
      const lines = linesByPayslip.get(payslip.id) ?? [];
      const employeeChanges = changesByEmployee.get(payslip.employeeId) ?? [];

      let originalTotal = 0;
      let currentTotal = 0;

      const resolvedLines = lines.map((l) => {
        const series =
          changesBySeries.get(`${payslip.employeeId}_${l.categoryId}`) ?? [];
        const currentRateCents =
          resolveRateCents(series, {
            asOf: payslip.date,
            dismissedChangeIds: dismissedIds,
          }) ?? l.rateCentsAtCreation;

        originalTotal += l.units * l.rateCentsAtCreation;
        currentTotal += l.units * currentRateCents;

        // A line has a dismissible change only when a rate edit made *after*
        // this payslip is currently the determining rate for that category.
        // Mismatches caused purely by the snapshot rule change (pre-payslip
        // edits winning under the new effective-date rule) are not dismissable.
        const hasDismissibleChange =
          nextChangeToDismiss(employeeChanges, {
            payslipDate: payslip.date,
            payslipCreatedAt: payslip.createdAt,
            categoryIds: new Set([l.categoryId]),
            dismissedChangeIds: dismissedIds,
          }) !== null;

        return {
          categoryId: l.categoryId,
          categoryName: categoryById.get(l.categoryId)?.name ?? `#${l.categoryId}`,
          units: l.units,
          rateCentsAtCreation: l.rateCentsAtCreation,
          currentRateCents,
          hasDismissibleChange,
        };
      });

      return {
        id: payslip.id,
        employee: employeeById.get(payslip.employeeId)!,
        date: payslip.date,
        createdAt: payslip.createdAt,
        originalTotal,
        currentTotal,
        // Retroactive = a line's applicable rate now differs from its snapshot.
        // Comparing per line (not just totals) so offsetting edits across
        // categories — one up, one down, same total — still count as changed,
        // matching the spec's rate-based definition.
        isRetroactive: resolvedLines.some(
          (l) => l.currentRateCents !== l.rateCentsAtCreation,
        ),
        hasDismissibleChange: resolvedLines.some((l) => l.hasDismissibleChange),
        lines: resolvedLines,
      };
    });
  }),

  // Preview which change would be dismissed next — read-only, safe to call before confirming.
  peekNextDismissibleChange: publicProcedure
    .input(z.object({ payslipId: z.number().int(), categoryId: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const payslip = await ctx.db.query.payslips.findFirst({
        where: eq(payslips.id, input.payslipId),
      });
      if (!payslip) return null;

      const [lines, cancelled, changes] = await Promise.all([
        ctx.db.select().from(payslipLines).where(eq(payslipLines.payslipId, payslip.id)),
        ctx.db.select().from(dismissedChanges),
        ctx.db.select().from(rateChanges).where(eq(rateChanges.employeeId, payslip.employeeId)),
      ]);

      const categoryIds =
        input.categoryId !== undefined
          ? new Set([input.categoryId])
          : new Set(lines.map((l) => l.categoryId));

      const change = nextChangeToDismiss(changes, {
        payslipDate: payslip.date,
        payslipCreatedAt: payslip.createdAt,
        categoryIds,
        dismissedChangeIds: new Set(cancelled.map((d) => d.rateChangeId)),
      });

      if (!change) return null;

      const [category] = await ctx.db
        .select()
        .from(paymentCategories)
        .where(eq(paymentCategories.id, change.categoryId));

      return {
        categoryName: category?.name ?? `#${change.categoryId}`,
        amountCents: change.amountCents,
        effectiveDate: change.effectiveDate,
      };
    }),

  // Dismiss (cancel) the retroactive rate edit currently determining this
  // payslip's rate — the greatest-effective-date edit made after it. Cancelling
  // is GLOBAL: the edit is removed from the timeline for every payslip and the
  // rates panel, reverting this payslip one step toward its original total.
  dismissLatestChange: publicProcedure
    .input(z.object({ payslipId: z.number().int(), categoryId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const payslip = await ctx.db.query.payslips.findFirst({
        where: eq(payslips.id, input.payslipId),
      });
      if (!payslip) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payslip not found." });
      }

      const [lines, cancelled, changes] = await Promise.all([
        ctx.db
          .select()
          .from(payslipLines)
          .where(eq(payslipLines.payslipId, payslip.id)),
        ctx.db.select().from(dismissedChanges),
        ctx.db
          .select()
          .from(rateChanges)
          .where(eq(rateChanges.employeeId, payslip.employeeId)),
      ]);

      // Scope to a single category when provided, otherwise all categories on the payslip.
      const categoryIds = input.categoryId !== undefined
        ? new Set([input.categoryId])
        : new Set(lines.map((l) => l.categoryId));

      const change = nextChangeToDismiss(changes, {
        payslipDate: payslip.date,
        payslipCreatedAt: payslip.createdAt,
        categoryIds,
        dismissedChangeIds: new Set(cancelled.map((d) => d.rateChangeId)),
      });

      if (!change) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payslip has no retroactive change left to dismiss.",
        });
      }

      const [inserted] = await ctx.db
        .insert(dismissedChanges)
        .values({ rateChangeId: change.id })
        .returning();

      return inserted!;
    }),

  delete: publicProcedure
    .input(z.object({ payslipId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const payslip = await ctx.db.query.payslips.findFirst({
        where: eq(payslips.id, input.payslipId),
      });
      if (!payslip) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payslip not found." });
      }

      // Cancellations are global (not owned by any payslip), so deleting a
      // payslip must not un-cancel anything — only its own lines are removed.
      // Sync callback: better-sqlite3 transactions reject a promise-returning fn.
      ctx.db.transaction((tx) => {
        tx.delete(payslipLines).where(eq(payslipLines.payslipId, input.payslipId)).run();
        tx.delete(payslips).where(eq(payslips.id, input.payslipId)).run();
      });
    }),
});
