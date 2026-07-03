import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { employees, paymentCategories, payslips, rateChanges, users } from "../db/schema";
import { appRouter } from "./root";
import { createCallerFactory } from "./trpc";

/**
 * End-to-end tests through the real tRPC routers against a fresh in-memory
 * SQLite database — living documentation of how the app is meant to be used.
 *
 * These drive the actual `rate` and `payslip` procedures (the same code the UI
 * calls), not the pure resolver. The resolver's rule is unit-tested separately
 * in `rates/resolve.test.ts`.
 *
 * Timestamp control: procedures stamp `created_at` with `datetime('now')`, which
 * has one-second resolution — every write in a fast test would collide. Since
 * retroactive detection hinges on "was this rate edit made *after* the payslip?",
 * we pin `created_at` explicitly after each write so the ordering is deterministic
 * rather than dependent on wall-clock timing.
 */

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

const createCaller = createCallerFactory(appRouter);

// Fresh DB per test for isolation.
let db: ReturnType<typeof drizzle<typeof schema>>;
let caller: ReturnType<typeof createCaller>;

const JOHN = 1;
const HOURLY = 1;
const OVERTIME = 2;

beforeEach(async () => {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  db = drizzle(client, { schema });
  migrate(db, { migrationsFolder });

  // Seed the fixtures the app assumes exist (no UI for these per the spec).
  await db.insert(users).values({ id: 1, name: "Alice Payroll" });
  await db.insert(employees).values({ id: JOHN, name: "John Doe", birthday: "1985-03-12" });
  await db.insert(paymentCategories).values([
    { id: HOURLY, name: "Hourly Rate" },
    { id: OVERTIME, name: "Overtime Hourly" },
  ]);

  caller = createCaller({ db });
});

/** Pin a rate change's transaction time so ordering is deterministic. */
async function stampRate(id: number, createdAt: string) {
  await db.update(rateChanges).set({ createdAt }).where(eq(rateChanges.id, id));
}

/** Pin a payslip's transaction time (the anchor for "edits made after"). */
async function stampPayslip(id: number, createdAt: string) {
  await db.update(payslips).set({ createdAt }).where(eq(payslips.id, id));
}

describe("core flow: set rate → create payslip → snapshot & total", () => {
  it("resolves the rate as of the payslip date and snapshots it into the total", async () => {
    // $10/hr effective Jan 1.
    await caller.rate.set({
      employeeId: JOHN,
      categoryId: HOURLY,
      effectiveDate: "2026-01-01",
      amountCents: 1000,
    });

    // The rates panel reads the rate "as of" a date.
    const ratesAsOfJan15 = await caller.rate.listForEmployee({ employeeId: JOHN, asOf: "2026-01-15" });
    expect(ratesAsOfJan15.find((r) => r.category.id === HOURLY)?.amountCents).toBe(1000);
    // Before the rate's effective date there is no rate yet.
    const ratesAsOf2025 = await caller.rate.listForEmployee({ employeeId: JOHN, asOf: "2025-12-31" });
    expect(ratesAsOf2025.find((r) => r.category.id === HOURLY)?.amountCents).toBeNull();

    // Payslip for 10 hours on Jan 15 → $100.
    await caller.payslip.create({
      employeeId: JOHN,
      date: "2026-01-15",
      lines: [{ categoryId: HOURLY, units: 10 }],
    });

    const list = await caller.payslip.list();
    expect(list).toHaveLength(1);
    const p = list[0]!;
    expect(p.originalTotal).toBe(10000);
    expect(p.currentTotal).toBe(10000);
    expect(p.isRetroactive).toBe(false);
    expect(p.lines[0]!.rateCentsAtCreation).toBe(1000);
  });

  it("rejects a payslip line for a category with no rate as of the date", async () => {
    await expect(
      caller.payslip.create({
        employeeId: JOHN,
        date: "2026-01-15",
        lines: [{ categoryId: HOURLY, units: 10 }],
      }),
    ).rejects.toThrow(/No rate found/);
  });

  it("rejects a malformed date", async () => {
    await expect(
      caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "01/15/2026", amountCents: 1000 }),
    ).rejects.toThrow();
  });
});

describe("retroactive change: a later-effective rate edit shifts a past payslip's total", () => {
  it("highlights the payslip and surfaces both original and current totals", async () => {
    // Original rate $10 effective Jan 1, made before the payslip.
    const a = await caller.rate.set({
      employeeId: JOHN,
      categoryId: HOURLY,
      effectiveDate: "2026-01-01",
      amountCents: 1000,
    });
    await stampRate(a!.id, "2026-01-01 09:00:00");

    // Payslip dated Jan 15 → $100, created before the retroactive edit.
    const created = await caller.payslip.create({
      employeeId: JOHN,
      date: "2026-01-15",
      lines: [{ categoryId: HOURLY, units: 10 }],
    });
    await stampPayslip(created.id, "2026-01-16 09:00:00");

    // A rate edit effective Jan 10 (between the original and the payslip date),
    // made AFTER the payslip → it now governs the payslip's rate.
    const b = await caller.rate.set({
      employeeId: JOHN,
      categoryId: HOURLY,
      effectiveDate: "2026-01-10",
      amountCents: 2000,
    });
    await stampRate(b!.id, "2026-02-01 09:00:00");

    const p = (await caller.payslip.list())[0]!;
    expect(p.originalTotal).toBe(10000); // snapshot never moves
    expect(p.currentTotal).toBe(20000); // $20 now governs Jan 15
    expect(p.isRetroactive).toBe(true);
    expect(p.hasDismissibleChange).toBe(true);
  });

  it("flags offsetting edits across categories even when the total is unchanged", async () => {
    // Two categories whose rate changes cancel out in the total but are still
    // real retroactive changes — the per-line check must catch this.
    const h = await caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "2026-01-01", amountCents: 1000 });
    const o = await caller.rate.set({ employeeId: JOHN, categoryId: OVERTIME, effectiveDate: "2026-01-01", amountCents: 2000 });
    await stampRate(h!.id, "2026-01-01 09:00:00");
    await stampRate(o!.id, "2026-01-01 09:00:00");

    const created = await caller.payslip.create({
      employeeId: JOHN,
      date: "2026-01-15",
      lines: [
        { categoryId: HOURLY, units: 10 }, // 10 × $10 = $100
        { categoryId: OVERTIME, units: 5 }, // 5 × $20 = $100
      ],
    });
    await stampPayslip(created.id, "2026-01-16 09:00:00");
    const original = (await caller.payslip.list())[0]!;
    expect(original.originalTotal).toBe(20000);

    // Hourly +$10/unit (×10 = +$100); Overtime → $0 (×5 = −$100). Total unchanged.
    const h2 = await caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "2026-01-10", amountCents: 2000 });
    const o2 = await caller.rate.set({ employeeId: JOHN, categoryId: OVERTIME, effectiveDate: "2026-01-10", amountCents: 0 });
    await stampRate(h2!.id, "2026-02-01 09:00:00");
    await stampRate(o2!.id, "2026-02-01 09:00:00");

    const p = (await caller.payslip.list())[0]!;
    expect(p.currentTotal).toBe(p.originalTotal); // totals identical
    expect(p.isRetroactive).toBe(true); // …but rates changed, so still flagged
  });
});

describe("dismiss: peel retroactive edits back to the original total", () => {
  it("dismisses greatest-effective-date first and reverts one step at a time", async () => {
    // Original $10 eff Jan 1, before the payslip.
    const a = await caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "2026-01-01", amountCents: 1000 });
    await stampRate(a!.id, "2026-01-01 09:00:00");

    const created = await caller.payslip.create({
      employeeId: JOHN,
      date: "2026-01-20",
      lines: [{ categoryId: HOURLY, units: 10 }],
    });
    await stampPayslip(created.id, "2026-01-21 09:00:00");

    // Two retroactive edits, made after the payslip: eff Jan 5 ($15) and eff Jan 10 ($20).
    const b = await caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "2026-01-05", amountCents: 1500 });
    await stampRate(b!.id, "2026-02-01 09:00:00");
    const c = await caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "2026-01-10", amountCents: 2000 });
    await stampRate(c!.id, "2026-02-02 09:00:00");

    // Greatest effective date (Jan 10, $20) governs.
    expect((await caller.payslip.list())[0]!.currentTotal).toBe(20000);

    // Preview then dismiss the Jan-10 edit → Jan-5 ($15) now governs.
    const peek1 = await caller.payslip.peekNextDismissibleChange({ payslipId: created.id });
    expect(peek1?.effectiveDate).toBe("2026-01-10");
    await caller.payslip.dismissLatestChange({ payslipId: created.id });
    expect((await caller.payslip.list())[0]!.currentTotal).toBe(15000);

    // Dismiss again → back to the original $10 snapshot, no longer retroactive.
    await caller.payslip.dismissLatestChange({ payslipId: created.id });
    const reverted = (await caller.payslip.list())[0]!;
    expect(reverted.currentTotal).toBe(10000);
    expect(reverted.isRetroactive).toBe(false);
    expect(reverted.hasDismissibleChange).toBe(false);

    // Nothing left to dismiss.
    await expect(
      caller.payslip.dismissLatestChange({ payslipId: created.id }),
    ).rejects.toThrow(/no retroactive change/i);
  });
});

/**
 * The spec's page-2 example, driven through the routers. The spec text reads as
 * "later-made edit wins" ($200); Finito confirmed the rule is effective-date-
 * decides, so a back-dated edit does NOT override a later-effective rate. The
 * Jan-2 rate governs the Jan-2 payslip and the payslip stays at $100.
 */
describe("spec page-2 example through the API — clarified rule yields $100", () => {
  it("a back-dated edit does not retroactively change a later-effective payslip", async () => {
    // $10 effective Feb 1 (made first).
    const a = await caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "2026-02-01", amountCents: 1000 });
    await stampRate(a!.id, "2026-01-01 09:00:00");

    const created = await caller.payslip.create({
      employeeId: JOHN,
      date: "2026-02-01",
      lines: [{ categoryId: HOURLY, units: 10 }],
    });
    await stampPayslip(created.id, "2026-01-02 09:00:00");

    // $20 back-dated to Jan 1, made AFTER the payslip.
    const b = await caller.rate.set({ employeeId: JOHN, categoryId: HOURLY, effectiveDate: "2026-01-01", amountCents: 2000 });
    await stampRate(b!.id, "2026-02-15 09:00:00");

    const p = (await caller.payslip.list())[0]!;
    expect(p.originalTotal).toBe(10000);
    expect(p.currentTotal).toBe(10000); // still $100 — Feb-1 rate governs, not the back-date
    expect(p.isRetroactive).toBe(false);
  });
});
