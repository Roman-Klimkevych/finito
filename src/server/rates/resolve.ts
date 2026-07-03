/**
 * Rate resolution — the temporal heart of the app.
 *
 * Rates live in an append-only log (`rate_changes`). Each row is one edit:
 * "starting on `effectiveDate`, the rate is `amountCents`", recorded at
 * `createdAt`. Rows are never mutated or deleted.
 *
 * There are two independent time axes:
 *
 *   - effectiveDate = VALID time  — when the rate is true in the real world.
 *   - createdAt     = TRANSACTION time — when the system learned about the edit.
 *
 * The resolution rule (confirmed with Finito via comments on the assignment
 * doc: effective date decides; dismiss peels greatest-effective-date first —
 * their 5 -> 4 -> 3 -> 1 example, encoded in resolve.test.ts):
 *
 *   rate(Q) = the edit with the greatest `effectiveDate`
 *             among all edits whose `effectiveDate <= Q`.
 *             Ties (same effectiveDate) are broken by greatest `createdAt` —
 *             a later correction to the same effective date wins.
 *
 * `effectiveDate` is both the GATE (is this edit in effect for the query date
 * yet?) and the DECIDER (of the in-effect edits, the one with the most recent
 * effective date governs). An edit governs the range from its `effectiveDate`
 * up to the next edit with a *later* effective date — a later-*made* edit with
 * an *earlier* effective date does NOT override it.
 *
 * Worked example (Finito's, from the assignment doc):
 *   1. Set rate to $5, effective 1/5.        -> edit A (eff 1/5)
 *   2. Set rate to $3, effective 1/3 (later). -> edit B (eff 1/3, made after A)
 *   3. For a payslip dated 1/6, the rate is $5.
 * Both A and B are in effect on 1/6 (both effectiveDate <= 1/6). A wins because
 * its effective date (1/5) is greater — even though B was *made* later. B only
 * governs [1/3, 1/5). A "greatest createdAt wins" rule would wrongly pick B ($3).
 *
 * NOTE: the spec's page-2 example reads as "greatest createdAt decides" ($20
 * eff 1/1 made after $10 eff 1/2, payslip dated 1/2 -> $200). Under the rule
 * Finito confirmed, that same case resolves to $10 — the 1/2 rate outranks the
 * back-dated 1/1 rate. Finito's clarification on the assignment doc governs; see
 * the "spec page-2" note in the README and the named test in resolve.test.ts.
 *
 * All comparisons are lexicographic string comparisons. This is safe because
 * `effectiveDate` is `YYYY-MM-DD` and `createdAt` is `YYYY-MM-DD HH:MM:SS`
 * (SQLite `datetime`) / ISO-8601 — both are monotonic under string ordering.
 */

export interface RateChange {
  id: number;
  employeeId: number;
  categoryId: number;
  /** Valid time: "YYYY-MM-DD". The date this rate takes effect. */
  effectiveDate: string;
  amountCents: number;
  /** Transaction time: sortable timestamp. When the edit was recorded. */
  createdAt: string;
}

export interface ResolveOptions {
  /** Valid-time query date ("YYYY-MM-DD"). The rate "as of" this date. */
  asOf: string;
  /**
   * Transaction-time upper bound (inclusive). When set, only edits the system
   * knew about at or before this instant are considered — the rate "as of
   * `asOf`, as known at `txBound`". Omit to read the live timeline (all edits
   * known now). This is what makes original-vs-current comparison possible.
   */
  txBound?: string;
  /**
   * Rate-change ids that have been dismissed (cancelled). Excluded from
   * resolution. Dismissal is GLOBAL — cancelling an edit removes it from the
   * timeline for every payslip and the rates panel — so this is a single set
   * shared across all resolution, not scoped to one payslip.
   */
  dismissedChangeIds?: ReadonlySet<number>;
}

/**
 * Returns true if edit `a` should win over the current best `b` under the
 * resolution rule: greater effective date wins; ties broken by greater
 * transaction time, then by id (a later insert has a higher autoincrement id).
 */
function outranks(a: RateChange, b: RateChange): boolean {
  if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate > b.effectiveDate;
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return a.id > b.id;
}

/**
 * Pick the rate change that determines the applicable rate as of a date.
 *
 * Precondition: `changes` is the edit history for a SINGLE (employee, category)
 * series. Callers with mixed categories should group first (see
 * `resolveEmployeeRates`). Returns null if no edit is in effect on `asOf`.
 */
export function pickApplicableChange(
  changes: readonly RateChange[],
  opts: ResolveOptions,
): RateChange | null {
  const { asOf, txBound, dismissedChangeIds } = opts;
  let best: RateChange | null = null;
  for (const c of changes) {
    if (c.effectiveDate > asOf) continue; // not yet in effect on the query date
    if (txBound !== undefined && c.createdAt > txBound) continue; // not yet known
    if (dismissedChangeIds?.has(c.id)) continue; // cancelled globally
    if (best === null || outranks(c, best)) best = c;
  }
  return best;
}

/**
 * The applicable rate in cents as of a date, or null if no rate is in effect.
 */
export function resolveRateCents(
  changes: readonly RateChange[],
  opts: ResolveOptions,
): number | null {
  return pickApplicableChange(changes, opts)?.amountCents ?? null;
}

export interface DismissCandidateOptions {
  /** The payslip's date (YYYY-MM-DD). An edit only affects it if effective ≤ this. */
  payslipDate: string;
  /**
   * The payslip's creation timestamp. Only edits made *after* this (created_at
   * strictly greater) are retroactive and therefore dismissable — an edit made
   * before the payslip is part of its original state, not a retroactive change.
   */
  payslipCreatedAt: string;
  /** The categories that appear on the payslip. Edits to other categories are irrelevant. */
  categoryIds: ReadonlySet<number>;
  /** Rate-change ids already dismissed (cancelled) — the global cancelled set. */
  dismissedChangeIds?: ReadonlySet<number>;
}

/**
 * Select the next rate change to dismiss for a payslip — the retroactive edit
 * currently determining its rate. Returns the retroactive, not-yet-dismissed
 * edit with the greatest `effectiveDate` (ties broken by greatest `createdAt`),
 * or null if the payslip has no retroactive edits left (it is back to its
 * original state).
 *
 * Precondition: `changes` are the rate edits for the payslip's employee.
 *
 * Because resolution picks the greatest-`effectiveDate` edit, dismissing it
 * lets the next-greatest-effective-date edit (or the original) win. Repeated
 * dismissal peels edits off in reverse effective-date order — matching the
 * Finito's example: rates 5 → 4 → 3 → 1 as each latest-effective edit is
 * cancelled in turn.
 */
export function nextChangeToDismiss(
  changes: readonly RateChange[],
  opts: DismissCandidateOptions,
): RateChange | null {
  const { payslipDate, payslipCreatedAt, categoryIds, dismissedChangeIds } = opts;
  let best: RateChange | null = null;
  for (const c of changes) {
    if (!categoryIds.has(c.categoryId)) continue; // not a category on this payslip
    if (c.effectiveDate > payslipDate) continue; // not in effect for the payslip
    if (c.createdAt <= payslipCreatedAt) continue; // predates the payslip → not retroactive
    if (dismissedChangeIds?.has(c.id)) continue; // already dismissed
    if (best === null || outranks(c, best)) best = c;
  }
  return best;
}

/**
 * Resolve the applicable rate change per category for an employee as of a date.
 * Accepts a mixed-category array (e.g. all of an employee's edits), groups by
 * category, and resolves each series independently.
 *
 * Returns a Map keyed by categoryId containing only categories that have a rate
 * in effect on `asOf`. Categories with no applicable edit are omitted; the
 * caller (which knows the full category list) decides how to present those.
 */
export function resolveEmployeeRates(
  changes: readonly RateChange[],
  opts: ResolveOptions,
): Map<number, RateChange> {
  const byCategory = new Map<number, RateChange[]>();
  for (const c of changes) {
    const series = byCategory.get(c.categoryId);
    if (series) series.push(c);
    else byCategory.set(c.categoryId, [c]);
  }

  const resolved = new Map<number, RateChange>();
  for (const [categoryId, series] of byCategory) {
    const applicable = pickApplicableChange(series, opts);
    if (applicable) resolved.set(categoryId, applicable);
  }
  return resolved;
}
