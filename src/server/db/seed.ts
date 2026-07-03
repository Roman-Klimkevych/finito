import { db } from "./index";
import {
  employees,
  paymentCategories,
  users,
} from "./schema";

async function seed() {
  console.log("Seeding database...");

  // Explicit ids give onConflictDoNothing a primary-key target, so re-running
  // `db:seed` is a no-op instead of duplicating every row (autoincrement inserts
  // never conflict, so the clause would otherwise do nothing on a second run).
  await db
    .insert(users)
    .values([{ id: 1, name: "Alice Payroll" }])
    .onConflictDoNothing();

  await db
    .insert(employees)
    .values([
      { id: 1, name: "John Doe", birthday: "1985-03-12" },
      { id: 2, name: "Jane Smith", birthday: "1990-07-24" },
      { id: 3, name: "Bob Johnson", birthday: "1978-11-05" },
    ])
    .onConflictDoNothing();

  await db
    .insert(paymentCategories)
    .values([
      { id: 1, name: "Hourly Rate" },
      { id: 2, name: "Overtime Hourly" },
      { id: 3, name: "Commission" },
      { id: 4, name: "Global Pay" },
    ])
    .onConflictDoNothing();

  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
