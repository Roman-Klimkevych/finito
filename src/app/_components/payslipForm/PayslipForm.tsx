"use client";

import { formatDollars } from "@/lib/format";
import { Button, Input, Select } from "../ui";
import { usePayslipForm } from "./usePayslipForm";
import { PayslipLineItem } from "./PayslipLineItem";

interface Props {
	effectiveDate: string;
}

export function PayslipForm({ effectiveDate }: Props) {
	const {
		employees,
		categories,
		employeeId,
		payslipDate,
		lines,
		lineValues,
		usedCategories,
		total,
		isValid,
		hasChanges,
		successMsg,
		isPending,
		isError,
		errorMessage,
		setEmployeeId,
		setPayslipDate,
		addLine,
		removeLine,
		updateLine,
		discardChanges,
		handleSubmit,
	} = usePayslipForm(effectiveDate);

	return (
		<section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h2 className="mb-4 text-base font-semibold text-gray-900">
				Create Payslip
			</h2>

			<form onSubmit={handleSubmit} className="space-y-5">
				<div className="flex flex-wrap gap-4">
					<div>
						<label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
							Employee
						</label>
						<Select
							value={employeeId ?? ""}
							onChange={(e) =>
								setEmployeeId(e.target.value ? Number(e.target.value) : null)
							}
							className="w-48"
						>
							<option value="">Select employee…</option>
							{employees?.map((emp) => (
								<option key={emp.id} value={emp.id}>
									{emp.name}
								</option>
							))}
						</Select>
					</div>

					<div>
						<label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
							Payslip date
						</label>
						<Input
							type="date"
							value={payslipDate}
							onChange={(e) => setPayslipDate(e.target.value)}
						/>
					</div>
				</div>

				{employeeId !== null && (
					<div>
						<div className="mb-1 grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
							<span>Category</span>
							<span>Units</span>
							<span>Rate</span>
							<span>Subtotal</span>
							<span />
						</div>

						<div className="space-y-2">
							{lines.map((line, i) => (
								<PayslipLineItem
									key={i}
									line={line}
									lineValue={lineValues[i]!}
									categories={categories}
									usedCategories={usedCategories}
									isOnly={lines.length === 1}
									onChange={(patch) => updateLine(i, patch)}
									onRemove={() => removeLine(i)}
								/>
							))}
						</div>

						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={addLine}
							className="mt-3"
						>
							+ Add line item
						</Button>
					</div>
				)}

				{employeeId !== null && (
					<div className="flex items-center justify-between border-t border-gray-100 pt-4">
						<span className="text-sm font-medium text-gray-700">
							Total:{" "}
							<span className="font-mono text-gray-900">
								{formatDollars(total)}
							</span>
						</span>

						<div className="flex items-center gap-3">
							{hasChanges && (
								<Button
									type="button"
									variant="muted"
									size="sm"
									onClick={discardChanges}
								>
									Discard
								</Button>
							)}
							<Button
								type="submit"
								variant="primary"
								size="sm"
								disabled={!isValid || isPending}
							>
								{isPending ? "Saving…" : "Create Payslip"}
							</Button>
						</div>
					</div>
				)}

				{isError && <p className="text-sm text-red-600">{errorMessage}</p>}
				{successMsg && (
					<p className="text-sm font-medium text-green-600">{successMsg}</p>
				)}
			</form>
		</section>
	);
}
