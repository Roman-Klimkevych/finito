"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Select } from "../ui";
import { RateRow } from "./RateRow";

interface Props {
	effectiveDate: string;
}

export function RatesPanel({ effectiveDate }: Props) {
	const [employeeId, setEmployeeId] = useState<number | null>(null);

	const { data: employees, isLoading: loadingEmployees } = api.employee.list.useQuery();
	const { data: rates, isLoading: loadingRates } = api.rate.listForEmployee.useQuery(
		{ employeeId: employeeId!, asOf: effectiveDate },
		{ enabled: employeeId !== null },
	);

	return (
		<section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h2 className="mb-4 text-base font-semibold text-gray-900">Employee Rates</h2>

			<div className="mb-6">
				<label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
					Employee
				</label>
				{loadingEmployees ? (
					<div className="h-9 w-56 animate-pulse rounded bg-gray-100" />
				) : (
					<Select
						value={employeeId ?? ""}
						onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
						className="w-56"
					>
						<option value="">Select employee…</option>
						{employees?.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{emp.name}
							</option>
						))}
					</Select>
				)}
			</div>

			{employeeId === null ? (
				<p className="text-sm text-gray-400">Select an employee to view their rates.</p>
			) : loadingRates ? (
				<div className="space-y-3">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="h-5 animate-pulse rounded bg-gray-100" />
					))}
				</div>
			) : (
				<table className="w-full table-fixed">
					<colgroup>
						<col />
						<col className="w-44" />
						<col className="w-24" />
					</colgroup>
					<thead>
						<tr className="border-b border-gray-200">
							<th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
								Category
							</th>
							<th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
								Rate (as of {effectiveDate})
							</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{rates?.map(({ category, amountCents }) => (
							<RateRow
								key={category.id}
								employeeId={employeeId}
								category={category}
								amountCents={amountCents}
								effectiveDate={effectiveDate}
							/>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}
