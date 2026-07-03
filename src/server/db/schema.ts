import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  birthday: text("birthday").notNull(), // ISO date string YYYY-MM-DD
});

export const paymentCategories = sqliteTable("payment_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

// Append-only rate change log.
// effective_date = valid time (when the rate takes effect in the real world).
// created_at     = transaction time (when the system recorded the change).
// Applicable rate as of date Q: row with max effective_date ≤ Q, tiebreak max created_at.
export const rateChanges = sqliteTable(
  "rate_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    categoryId: integer("category_id")
      .notNull()
      .references(() => paymentCategories.id),
    effectiveDate: text("effective_date").notNull(), // ISO date YYYY-MM-DD
    amountCents: integer("amount_cents").notNull(), // money stored as integer cents
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  // Resolution loads one employee's edits and picks the applicable row per
  // (employee, category) series in memory (see rates/resolve.ts). This index
  // narrows the fetch to the relevant employee/category rows so the in-memory
  // set stays small as the log grows; it does not change the scan itself.
  (t) => [
    index("rate_changes_series_idx").on(
      t.employeeId,
      t.categoryId,
      t.createdAt,
    ),
  ],
);

export const payslips = sqliteTable("payslips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id),
  date: text("date").notNull(), // ISO date YYYY-MM-DD — the "worked" date
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => users.id),
  // Transaction-time anchor: used to detect which rate edits came *after* this payslip.
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// One row per line item. rate_cents_at_creation is the rate resolved as of
// payslip.date at the moment of creation — the snapshot for the original total.
export const payslipLines = sqliteTable("payslip_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payslipId: integer("payslip_id")
    .notNull()
    .references(() => payslips.id),
  categoryId: integer("category_id")
    .notNull()
    .references(() => paymentCategories.id),
  units: integer("units").notNull(),
  rateCentsAtCreation: integer("rate_cents_at_creation").notNull(),
});

// Global cancellation log. Dismissing a rate edit CANCELS it: it is removed
// from the timeline for every payslip and the rates panel, not just the one the
// user dismissed from. Append-only marker (one row per cancelled edit) so the
// `rate_changes` log itself stays immutable and the cancellation is auditable.
export const dismissedChanges = sqliteTable(
  "dismissed_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rateChangeId: integer("rate_change_id")
      .notNull()
      .references(() => rateChanges.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("dismissed_changes_change_uidx").on(t.rateChangeId)],
);
