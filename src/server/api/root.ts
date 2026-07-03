import { createTRPCRouter } from "./trpc";
import { employeeRouter } from "./routers/employee";
import { categoryRouter } from "./routers/category";
import { rateRouter } from "./routers/rate";
import { payslipRouter } from "./routers/payslip";

export const appRouter = createTRPCRouter({
  employee: employeeRouter,
  category: categoryRouter,
  rate: rateRouter,
  payslip: payslipRouter,
});

export type AppRouter = typeof appRouter;
