"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "./ui";
import { RatesPanel } from "./rates/RatesPanel";
import { PayslipForm } from "./payslipForm/PayslipForm";
import { PayslipList } from "./payslipList/PayslipList";

function todayISO() {
	return new Date().toISOString().split("T")[0]!;
}

export function AppContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const effectiveDate = searchParams.get("asOf") ?? todayISO();

	const setEffectiveDate = useCallback(
		(date: string) => {
			const params = new URLSearchParams(searchParams.toString());
			params.set("asOf", date);
			router.replace(`${pathname}?${params.toString()}`);
		},
		[searchParams, router, pathname]
	);

	return (
		<div className="min-h-screen bg-gray-50">
			<header className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
				<div className="mx-auto flex max-w-4xl items-center justify-between">
					<h1 className="text-lg font-semibold text-gray-900">Finito</h1>
					<div className="flex items-center gap-3">
						<label className="text-sm font-medium text-gray-600">
							Effective date
						</label>
						<Input
							type="date"
							value={effectiveDate}
							onChange={(e) => setEffectiveDate(e.target.value)}
						/>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
				<RatesPanel effectiveDate={effectiveDate} />
				<PayslipForm effectiveDate={effectiveDate} />
				<PayslipList />
			</main>
		</div>
	);
}
