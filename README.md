# Finito — Time-Aware Rate Management

A payroll rate-management app with retroactive-change detection. Rates change over
time, and edits can be back-dated — so a rate edit made today can retroactively
change the total of a payslip created last week. This app makes that visible and
reversible.

---

## Stack

TypeScript · Next.js · tRPC · Drizzle · SQLite

Chosen to match Finito's own stack and because it lets the temporal logic live in
plain, testable TypeScript with a thin typed API over it.

---

## Note on the spec's page-2 example

The spec's page-2 example reads as **`created_at` decides** (a back-dated edit made
later wins → a Jan-2 payslip resolves to **$200**). I raised this on the assignment
doc, and **Finito confirmed the rule is `effective_date` decides**, with the
5 → 4 → 3 → 1 dismiss-peel example to match. So this app resolves that same scenario
to **$100**: the Jan-2 rate governs `[Jan 2, ∞)` and the back-dated Jan-1 rate governs
`[Jan 1, Jan 2)` — a back-date does not silently override a later-effective rate.

Both the page-2 scenario ($100) and Finito's 5 → 4 → 3 → 1 example are encoded as named
tests in `resolve.test.ts`. The full reasoning is under
[The core idea](#the-core-idea-two-independent-time-axes) below.

---

## How to run

```bash
npm install
npm run db:migrate   # creates finito.db and applies the schema
npm run db:seed      # inserts 3 employees, 4 payment categories, 1 user
npm run dev          # starts Next.js on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000).

The **Effective date** picker in the top-right corner maps to the `?asOf=YYYY-MM-DD`
URL query param — bookmarkable, shareable, and safe to manipulate directly.

### Reproducing a retroactive change

1. Set effective date to **Jan 1**. Select **John Doe** and set **Hourly Rate** to **$10.00**.
2. Create a payslip for John Doe dated **Jan 15**, **10 units** of Hourly Rate. Total = **$100**.
3. Change the effective date to **Jan 10** (a date _between_ the original rate and the payslip).
4. Set Hourly Rate to **$20.00** at Jan 10.
   → The payslip row turns amber: original **$100**, current **$200** (the Jan 10 rate now governs).
5. Click **Dismiss** → current reverts to $100, row clears.

The new rate must have an effective date **between** the original rate's effective date
and the payslip date. That puts it later on the valid-time axis than the original, so it
outranks the original under the resolution rule (see below).

## How to run the tests

```bash
npm test
```

`npm test` runs the whole suite (Vitest, no watch):

- **Unit tests** — `src/server/rates/resolve.test.ts` covers the full resolution rule
  (valid-time gating, effective-date tiebreaking, `txBound`, cancelled changes,
  per-category resolution), the spec page-2 scenario ($100 under the clarified rule),
  and Finito's 5→4→3→1 peel sequence as living documentation.
- **Integration tests** — `src/server/api/flows.integration.test.ts` drives the real
  tRPC routers against an in-memory SQLite database through the core flow: set rate →
  create payslip → back-date a rate edit → see the retroactive highlight → dismiss →
  revert. This is the "living documentation of how the app is meant to be used."

---

## The core idea: two independent time axes

Nearly all the difficulty here comes from there being **two** kinds of time, and the
requirements quietly depend on both:

| Axis                 | Field            | Meaning                                                                | Used for                                                                                     |
| -------------------- | ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Valid time**       | `effective_date` | When a rate is true in the real world ("starting on D, the rate is X") | Reading rates "as of" a date; computing payslip totals; deciding which rate wins             |
| **Transaction time** | `created_at`     | When the system _learned_ about the edit                               | Detecting retroactive changes ("an edit made _after_ the payslip was created"); dismiss      |

The "time travel" effective-date selector is simply a UI handle on the **valid-time**
axis. Retroactive detection lives on the **transaction-time** axis.

---

## Data model

Append-only rate history is the heart of the design.

```
employees(id, name, birthday)                           -- seeded, no UI
payment_categories(id, name)                            -- seeded, no UI
users(id, name)                                         -- single seeded row

rate_changes(                                           -- APPEND ONLY, never updated/deleted
  id, employee_id, category_id,
  effective_date DATE,                                  -- valid time
  amount_cents INT,
  created_at TIMESTAMP                                  -- transaction time
)

payslips(
  id, employee_id, date,
  created_by_user_id,
  created_at TIMESTAMP                                  -- anchor for "which edits came after"
)

payslip_lines(
  id, payslip_id, category_id, units,
  rate_cents_at_creation INT                            -- snapshot → original total
)

dismissed_changes(id, rate_change_id UNIQUE, created_at)  -- global cancellation log
```

**Money** is stored as integer cents (no float drift). **`effective_date` is a DATE,
`created_at` is a TIMESTAMP** — that type split is the valid-time/transaction-time
distinction made physical.

### Why append-only

"Change a rate" is an `INSERT`, never an update. The rate that applies on date `Q` is
_derived on read_:

```
the rate_change row with the greatest effective_date
among all rows with effective_date ≤ Q
(ties on effective_date broken by greatest created_at;
ties on created_at broken by id)
```

`effective_date` is both the **gate** (is this edit in effect for `Q` yet?) and the
**decider** (of the in-effect edits, the one with the most recent effective date governs).
An edit governs the range `[its effective_date, next edit with a later effective_date)`.
A later-_made_ but earlier-_effective_ edit does not override it.

Because rows are immutable, this table is a **bitemporal model in disguise**:
the valid-time axis is `effective_date` (gate and decider), the transaction-time axis is
`created_at` (retroactive detection and `txBound` time-travel) — with
**zero interval bookkeeping**. See `src/server/rates/resolve.ts` for the resolver and
`resolve.test.ts` for examples encoded as tests.

### The clarified rule vs. the spec's page-2 example

The spec's page-2 example sets $10 effective Jan 2 (made first), then back-dates $20 to
Jan 1 (made second), and reads as a Jan-2 payslip resolving to **$200** — a "greatest
`created_at` wins" rule, where the later-_made_ edit wins regardless of effective date.
I flagged this on the assignment doc, and **Finito confirmed the intended rule is
`effective_date` decides** (with the 5→4→3→1 peel example to match).

So this app returns **$100**. Under effective-date-decides, the Jan-2 rate ($10)
governs [Jan 2, ∞) and the Jan-1 rate ($20) governs [Jan 1, Jan 2) — back-dating does not
silently override a rate already scheduled for a later effective date. In a payroll context,
"I set the rate starting Jan 10" should mean it takes effect on Jan 10 and holds until
superseded by a _later_-effective edit; it should not clobber a Jan 15 rate that the
specialist had already set. The $100 result is pinned as a named test in `resolve.test.ts`.

---

## How each requirement maps to the model

- **Read rates "as of" D** → per category, the row with the greatest `effective_date`
  among all rows with `effective_date ≤ D` (ties broken by greatest `created_at`, then `id`).
- **Edit a rate at effective date D** → insert one `rate_change` with `effective_date = D`.
- **Payslip total at creation** → resolve each line's rate as of `payslip.date` and
  **snapshot** it into `payslip_lines.rate_cents_at_creation`.
- **Original total** → `Σ (units × rate_cents_at_creation)` — a free read; can never
  drift, since payslips are immutable after creation.
- **Current total** → re-resolve each line as of `payslip.date` from the live log,
  excluding globally dismissed edits.
- **Retroactively changed?** → `currentTotal ≠ originalTotal`. Concretely: a
  `rate_change` exists with `created_at > payslip.created_at`, `effective_date ≤ payslip.date`,
  and `effective_date` greater than any pre-payslip edit for that category — so it now
  governs that payslip's rate.

---

## Dismiss semantics

### Representation: global cancellation log

`dismissed_changes(rate_change_id UNIQUE, created_at)` — a globally append-only
cancellation marker with one row per cancelled edit. Excluding dismissed ids from
resolution removes the edit from the entire timeline: current totals across all payslips,
the rates panel, and new payslip creation all reflect the cancellation.

Dismissing is a global correction — "this edit should not be in the timeline" — not a
per-payslip preference. A rate edit is a fact shared by every payslip it affects; it
makes no sense to accept it for some payslips and reject it for others.

### Peel order: greatest `effective_date` first

The resolution rule picks the edit with the greatest `effective_date` ≤ payslip date.
Dismissing that edit lets the next-greatest-`effective_date` non-dismissed edit win,
reverting the payslip one step toward its original total. Peeling proceeds in reverse
valid-time order (greatest effective date first) — matching Finito's worked example:
rates 5 → 4 → 3 → 1 as each latest-effective retroactive edit is cancelled in turn.

Only retroactive edits (created *after* the payslip) are eligible. The original
pre-payslip edit is the floor: once all retroactive edits are dismissed, the payslip
is back to its snapshot total with nothing left to dismiss.

---

## Efficiency (scaling as edit history grows)

Resolution is performed **in memory** after a bulk fetch, not in SQL.

- `payslip.list` fetches all `rate_changes`, all `payslip_lines`, and all
  `dismissed_changes` in three parallel queries, then resolves every line in a single
  JS pass — **no N+1 round-trips**. For typical payroll datasets this is fast and
  straightforward.
- Resolution per `(employee, category)` series is a linear scan — O(n) in the number
  of edits for that series. Series are typically short; the index on
  `rate_changes(employee_id, category_id, created_at)` keeps the in-memory set small
  by eliminating other employees/categories at the DB level.
- The **original total is snapshotted** in `payslip_lines.rate_cents_at_creation`, so
  the list never recomputes it and it can never drift (payslips are immutable). Only
  the current total is resolved per render.
- At scale, fetching the entire `rate_changes` table becomes the bottleneck. The natural
  upgrade is a SQL window function that resolves rates in one query (noted in "What I'd
  change" below).

---

## Trade-offs considered and rejected

- **Interval table `(valid_from, valid_to)`** — reads are a simple range query, but
  every write must _mutate_ prior rows to close intervals, and back-dating an edit
  requires splitting intervals. Destroys immutability and complicates retroactive
  detection + dismiss. Rejected.
- **Full system-versioned bitemporal (`valid_from/to` + `tx_from/to`)** — the textbook
  answer, but heavy interval maintenance for no added power at this scope. The
  append-only log answers the same questions by sorting. Rejected as over-engineering.
- **Reconstructing original total from the log** instead of snapshotting — purer (no
  denormalization), but requires a `txBound`-filtered re-resolution per line on every
  list render. Since payslips are immutable, a snapshot can never drift, so it is
  strictly cheaper with no correctness cost. Chose snapshot.
- **`created_at`-decides resolution** — matches the spec's page-2 example literally,
  but makes every back-date an implicit override of all later-effective rates already
  set. Effective-date-decides gives each edit a clear, non-overlapping forward slice of
  the timeline. Rejected in favour of effective-date-decides, which Finito confirmed as
  the intended rule (see the note near the top of this README).

---

## What I'd change with more time

- **Batch current-total resolution** — the payslip list resolves each line's rate in
  memory after a bulk fetch; for large payslip histories a single windowed SQL query
  (row_number ordered by `effective_date DESC, created_at DESC` within each
  `(employee_id, category_id)` partition, filtered to `effective_date ≤ payslip.date`)
  would be one round-trip instead of an in-memory scan per payslip.
- **Audit view** — a read-only timeline of `rate_changes` per employee, annotated with
  which payslips each edit retroactively affects, would make the temporal model
  self-documenting in the UI.
- **Multi-step dismiss ordering** — `nextChangeToDismiss` peels one change at a time
  with no indication of how many remain; a remaining-count badge and a "dismiss all"
  shortcut would close that gap.
- **Authentication** — `createdByUserId` is hardcoded to `1`; wiring real session-based
  auth would unlock per-user rate visibility and payslip ownership.
- **Optimistic dismiss** — the dismiss mutation waits for a server round-trip before
  the UI reflects the change; React Query's `onMutate` / rollback pattern would make it
  feel instant (payslip delete already uses a direct cache update for immediate feedback).
- **Shared Zod validation** — the form relies on computed `isValid` state; a Zod schema
  shared between the tRPC router and the form would give consistent, typed validation
  with no duplication.
- **Pagination** — `payslip.list` fetches every row in one query; keyset pagination
  (cursor on `(date DESC, id DESC)`) would keep response times flat as data grows.
- **Error boundaries** — tRPC errors surface as raw strings; React error boundaries with
  user-friendly fallbacks would prevent one broken query from collapsing the whole page.
