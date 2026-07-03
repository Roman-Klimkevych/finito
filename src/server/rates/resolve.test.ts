import { describe, expect, it } from "vitest";
import {
  nextChangeToDismiss,
  pickApplicableChange,
  resolveEmployeeRates,
  resolveRateCents,
  type RateChange,
} from "./resolve";

/**
 * Test helper. Builds a RateChange with sensible defaults so each test only
 * states the fields it cares about. `createdAt` defaults to something derived
 * from `id` so "later id = later transaction time" holds unless overridden.
 */
function change(partial: Partial<RateChange> & { id: number }): RateChange {
  return {
    employeeId: 1,
    categoryId: 1,
    effectiveDate: "2026-01-01",
    amountCents: 1000,
    createdAt: `2026-01-01 00:00:0${partial.id}`,
    ...partial,
  };
}

describe("pickApplicableChange — valid-time gating", () => {
  it("returns null when there is no history", () => {
    expect(pickApplicableChange([], { asOf: "2026-01-01" })).toBeNull();
  });

  it("returns null when every edit takes effect after the query date", () => {
    const changes = [change({ id: 1, effectiveDate: "2026-02-01" })];
    expect(pickApplicableChange(changes, { asOf: "2026-01-15" })).toBeNull();
  });

  it("includes an edit effective exactly on the query date (inclusive)", () => {
    const changes = [change({ id: 1, effectiveDate: "2026-01-15", amountCents: 500 })];
    expect(resolveRateCents(changes, { asOf: "2026-01-15" })).toBe(500);
  });

  it("picks the edit in effect, ignoring future-dated edits", () => {
    const changes = [
      change({ id: 1, effectiveDate: "2026-01-01", amountCents: 1000 }),
      change({ id: 2, effectiveDate: "2026-03-01", amountCents: 3000 }),
    ];
    expect(resolveRateCents(changes, { asOf: "2026-02-01" })).toBe(1000);
  });
});

describe("pickApplicableChange — effective date decides", () => {
  it("the greatest effective date ≤ Q wins, even if made earlier", () => {
    // The rule Finito confirmed: an edit governs from its effective date up
    // to the next *later* effective date. A later-MADE but earlier-effective
    // edit does not override it.
    const changes = [
      change({ id: 1, effectiveDate: "2026-01-05", amountCents: 500, createdAt: "2026-01-05 09:00:00" }),
      change({ id: 2, effectiveDate: "2026-01-03", amountCents: 300, createdAt: "2026-01-10 09:00:00" }),
    ];
    // Query date 1/6: both in effect; eff 1/5 outranks the later-made eff 1/3.
    expect(resolveRateCents(changes, { asOf: "2026-01-06" })).toBe(500);
  });

  it("a later correction to the SAME effective date wins (createdAt tiebreak)", () => {
    const changes = [
      change({ id: 1, effectiveDate: "2026-01-01", amountCents: 1000, createdAt: "2026-01-02 09:00:00" }),
      change({ id: 2, effectiveDate: "2026-01-01", amountCents: 2000, createdAt: "2026-01-03 09:00:00" }),
    ];
    expect(resolveRateCents(changes, { asOf: "2026-06-01" })).toBe(2000);
  });

  it("breaks createdAt ties by id (later insert wins)", () => {
    const changes = [
      change({ id: 5, amountCents: 1000, createdAt: "2026-01-01 12:00:00" }),
      change({ id: 6, amountCents: 2000, createdAt: "2026-01-01 12:00:00" }),
    ];
    expect(resolveRateCents(changes, { asOf: "2026-06-01" })).toBe(2000);
  });
});

describe("pickApplicableChange — txBound (as-known-at / transaction-time travel)", () => {
  // Two corrections to the SAME effective date (1/1), made on different days.
  // Same effective date, so transaction time is what changes the answer here.
  const changes = [
    change({ id: 1, effectiveDate: "2026-01-01", amountCents: 1000, createdAt: "2026-01-02 09:00:00" }),
    change({ id: 2, effectiveDate: "2026-01-01", amountCents: 2000, createdAt: "2026-01-03 09:00:00" }),
  ];

  it("as known before the second edit, resolves to the original rate", () => {
    expect(
      resolveRateCents(changes, { asOf: "2026-01-02", txBound: "2026-01-02 12:00:00" }),
    ).toBe(1000);
  });

  it("as known after the second edit, resolves to the corrected rate", () => {
    expect(
      resolveRateCents(changes, { asOf: "2026-01-02", txBound: "2026-01-03 12:00:00" }),
    ).toBe(2000);
  });

  it("txBound is inclusive", () => {
    expect(
      resolveRateCents(changes, { asOf: "2026-01-02", txBound: "2026-01-03 09:00:00" }),
    ).toBe(2000);
  });
});

describe("pickApplicableChange — cancelled (dismissed) changes", () => {
  it("excludes cancelled edits and falls back to the prior determining edit", () => {
    const changes = [
      change({ id: 1, effectiveDate: "2025-01-01", amountCents: 1000, createdAt: "2025-01-01 09:00:00" }),
      change({ id: 2, effectiveDate: "2026-01-01", amountCents: 2000, createdAt: "2026-06-01 09:00:00" }),
    ];
    const asOf = "2026-06-01";
    expect(resolveRateCents(changes, { asOf })).toBe(2000);
    expect(
      resolveRateCents(changes, { asOf, dismissedChangeIds: new Set([2]) }),
    ).toBe(1000);
  });
});

describe("resolveEmployeeRates — per-category resolution", () => {
  it("resolves each category independently", () => {
    const changes = [
      change({ id: 1, categoryId: 10, amountCents: 1000, createdAt: "2026-01-01 09:00:00" }),
      change({ id: 2, categoryId: 10, amountCents: 1500, createdAt: "2026-02-01 09:00:00" }),
      change({ id: 3, categoryId: 20, amountCents: 5000, createdAt: "2026-01-01 09:00:00" }),
    ];
    // Category 10's two edits share the default effective date, so the later
    // correction (1500) wins by createdAt tiebreak.
    const rates = resolveEmployeeRates(changes, { asOf: "2026-06-01" });
    expect(rates.get(10)?.amountCents).toBe(1500);
    expect(rates.get(20)?.amountCents).toBe(5000);
  });

  it("omits categories with no edit in effect on the query date", () => {
    const changes = [change({ id: 1, categoryId: 10, effectiveDate: "2026-05-01" })];
    const rates = resolveEmployeeRates(changes, { asOf: "2026-01-01" });
    expect(rates.has(10)).toBe(false);
  });
});

describe("nextChangeToDismiss", () => {
  const payslipDate = "2026-03-15";
  const payslipCreatedAt = "2026-01-10 09:00:00";
  const categoryIds = new Set([1]);

  it("returns null when there are no retroactive edits", () => {
    // Only an edit made before the payslip → part of its original state.
    const changes = [
      change({ id: 1, createdAt: "2026-01-01 09:00:00", effectiveDate: "2026-01-01" }),
    ];
    expect(
      nextChangeToDismiss(changes, { payslipDate, payslipCreatedAt, categoryIds }),
    ).toBeNull();
  });

  it("ignores edits effective after the payslip date", () => {
    const changes = [
      change({ id: 1, createdAt: "2026-02-01 09:00:00", effectiveDate: "2026-06-01" }),
    ];
    expect(
      nextChangeToDismiss(changes, { payslipDate, payslipCreatedAt, categoryIds }),
    ).toBeNull();
  });

  it("ignores edits for categories not on the payslip", () => {
    const changes = [
      change({ id: 1, categoryId: 99, createdAt: "2026-02-01 09:00:00", effectiveDate: "2026-01-01" }),
    ];
    expect(
      nextChangeToDismiss(changes, { payslipDate, payslipCreatedAt, categoryIds }),
    ).toBeNull();
  });

  it("peels retroactive edits by greatest effective date first (not creation order)", () => {
    const changes = [
      change({ id: 1, createdAt: "2026-01-01 09:00:00", effectiveDate: "2026-01-01", amountCents: 100 }), // original, predates payslip
      change({ id: 2, createdAt: "2026-02-01 09:00:00", effectiveDate: "2026-01-04", amountCents: 400 }), // retro, eff 1/4
      change({ id: 3, createdAt: "2026-02-02 09:00:00", effectiveDate: "2026-01-05", amountCents: 500 }), // retro, eff 1/5
      change({ id: 4, createdAt: "2026-02-03 09:00:00", effectiveDate: "2026-01-03", amountCents: 300 }), // retro, eff 1/3, made LAST
    ];
    // Greatest effective date among retro edits = 1/5 (id 3), though id 4 is newest.
    const first = nextChangeToDismiss(changes, { payslipDate, payslipCreatedAt, categoryIds });
    expect(first?.id).toBe(3);

    const second = nextChangeToDismiss(changes, {
      payslipDate,
      payslipCreatedAt,
      categoryIds,
      dismissedChangeIds: new Set([3]),
    });
    expect(second?.id).toBe(2); // eff 1/4

    const third = nextChangeToDismiss(changes, {
      payslipDate,
      payslipCreatedAt,
      categoryIds,
      dismissedChangeIds: new Set([3, 2]),
    });
    expect(third?.id).toBe(4); // eff 1/3

    const fourth = nextChangeToDismiss(changes, {
      payslipDate,
      payslipCreatedAt,
      categoryIds,
      dismissedChangeIds: new Set([3, 2, 4]),
    });
    expect(fourth).toBeNull(); // id 1 predates the payslip → original, not dismissable
  });

  it("peels across multiple categories by effective date", () => {
    const changes = [
      change({ id: 1, categoryId: 1, createdAt: "2026-02-01 09:00:00", effectiveDate: "2026-01-05" }),
      change({ id: 2, categoryId: 2, createdAt: "2026-02-15 09:00:00", effectiveDate: "2026-01-03" }),
    ];
    const opts = { payslipDate, payslipCreatedAt, categoryIds: new Set([1, 2]) };
    expect(nextChangeToDismiss(changes, opts)?.id).toBe(1); // eff 1/5 > eff 1/3
    expect(
      nextChangeToDismiss(changes, { ...opts, dismissedChangeIds: new Set([1]) })?.id,
    ).toBe(2);
  });
});

/**
 * The spec's page-2 worked example, encoded as a named test of the clarified rule.
 *
 * Spec text reads as:
 *   1. Set hourly rate to $10, effective Jan 2 (made first).
 *   2. Set hourly rate to $20, effective Jan 1 (back-dated, made second).
 *   3. Payslip dated Jan 2 → current total = $200 (later-MADE edit wins).
 *
 * Finito confirmed (comments on the assignment doc) that effective date decides,
 * so this app returns $100 instead. Under effective-date-decides, the Jan-2 rate
 * ($10) governs [Jan 2, ∞) regardless of when it was made. The back-dated Jan-1
 * rate ($20) governs [Jan 1, Jan 2) — it does not override the Jan-2 rate.
 *
 * The rule fits payroll: "I set the rate effective Jan 10" means it takes effect
 * on Jan 10 and holds forward until a later-effective-date edit supersedes it. A
 * created_at-decides rule turns every back-date into a silent global override of
 * all later-effective rates, which is surprising.
 */
describe("spec page-2 worked example — clarified rule returns $100, not the $200 the text implies", () => {
  it("back-dated edit does NOT override a later-effective rate", () => {
    const changes = [
      change({ id: 1, effectiveDate: "2026-01-02", amountCents: 1000, createdAt: "2026-01-02 09:00:00" }), // $10 eff 1/2, made first
      change({ id: 2, effectiveDate: "2026-01-01", amountCents: 2000, createdAt: "2026-01-03 09:00:00" }), // $20 eff 1/1, back-dated, made second
    ];
    // Spec (created_at-decides) would give 2000 ($200); effective-date-decides gives 1000 ($100).
    expect(resolveRateCents(changes, { asOf: "2026-01-02" })).toBe(1000);
  });
});

/**
 * Finito's worked example (from their comment on the assignment doc), encoded as
 * living documentation. If this ever fails, the temporal semantics have drifted
 * from what Finito confirmed.
 */
describe("Finito worked example — effective date decides + peel order 5→4→3→1", () => {
  // Transaction (creation) order: rate 1 @1/1, payslip @1/6, then the retro
  // edits made AFTER the payslip: rate 4 @1/4, rate 5 @1/5, rate 3 @1/3.
  const original = change({ id: 1, effectiveDate: "2026-01-01", amountCents: 100, createdAt: "2026-01-01 09:00:00" });
  const r4 = change({ id: 2, effectiveDate: "2026-01-04", amountCents: 400, createdAt: "2026-01-07 09:00:00" });
  const r5 = change({ id: 3, effectiveDate: "2026-01-05", amountCents: 500, createdAt: "2026-01-08 09:00:00" });
  const r3 = change({ id: 4, effectiveDate: "2026-01-03", amountCents: 300, createdAt: "2026-01-09 09:00:00" });
  const changes = [original, r4, r5, r3];

  const payslipDate = "2026-01-06";
  const payslipCreatedAt = "2026-01-06 09:00:00"; // after rate 1, before r4/r5/r3
  const categoryIds = new Set([1]);
  const dismissed = new Set<number>();

  const currentRate = () =>
    resolveRateCents(changes, { asOf: payslipDate, dismissedChangeIds: dismissed });
  const dismissNext = () => {
    const c = nextChangeToDismiss(changes, {
      payslipDate,
      payslipCreatedAt,
      categoryIds,
      dismissedChangeIds: dismissed,
    });
    if (c) dismissed.add(c.id);
    return c;
  };

  it("snapshot at creation sees only rate 1 (the original)", () => {
    expect(resolveRateCents(changes, { asOf: payslipDate, txBound: payslipCreatedAt })).toBe(100);
  });

  it("resolves and peels 5 → 4 → 3 → 1", () => {
    expect(currentRate()).toBe(500); // eff 1/5 wins (greatest effective date ≤ 1/6)
    expect(dismissNext()?.id).toBe(3); // cancel rate 5
    expect(currentRate()).toBe(400); // eff 1/4
    expect(dismissNext()?.id).toBe(2); // cancel rate 4
    expect(currentRate()).toBe(300); // eff 1/3 — "no effect until dismissed twice"
    expect(dismissNext()?.id).toBe(4); // cancel rate 3
    expect(currentRate()).toBe(100); // back to the original (rate 1) — no highlight
    expect(dismissNext()).toBeNull(); // nothing left to dismiss
  });
});
