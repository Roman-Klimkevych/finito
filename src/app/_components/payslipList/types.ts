import { type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type Payslip = RouterOutputs["payslip"]["list"][number];
export type PayslipLine = Payslip["lines"][number];
