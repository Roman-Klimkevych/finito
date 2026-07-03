"use client";

import { useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { formatDollars } from "@/lib/format";

export interface LineItem {
	categoryId: number | null;
	units: string;
}

export function usePayslipForm(effectiveDate: string) {
	const [employeeId, setEmployeeIdRaw] = useState<number | null>(null);
	// Until the user edits the date field, the payslip date tracks the header's
	// effective date (so changing the "as of" date up top pre-fills the form).
	// Once they set an explicit value, that override wins. Derived, not synced,
	// so there's no effect and no stale copy of the header date to keep in step.
	const [dateOverride, setDateOverride] = useState<string | null>(null);
	const payslipDate = dateOverride ?? effectiveDate;
	const [lines, setLines] = useState<LineItem[]>([{ categoryId: null, units: "" }]);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);

	const { data: employees } = api.employee.list.useQuery();
	const { data: categories } = api.category.list.useQuery();
	const { data: rates } = api.rate.listForEmployee.useQuery(
		{ employeeId: employeeId!, asOf: payslipDate },
		{ enabled: employeeId !== null },
	);

	const rateMap = useMemo(() => {
		if (!rates) return new Map<number, number>();
		return new Map(rates.map((r) => [r.category.id, r.amountCents ?? 0]));
	}, [rates]);

	const usedCategories = useMemo(
		() => new Set(lines.map((l) => l.categoryId).filter(Boolean)),
		[lines],
	);

	const lineValues = useMemo(
		() =>
			lines.map((line) => {
				const rate = line.categoryId ? rateMap.get(line.categoryId) ?? null : null;
				const units = parseInt(line.units) || 0;
				const subtotal = rate !== null && units > 0 ? rate * units : null;
				return { rate, units, subtotal };
			}),
		[lines, rateMap],
	);

	const total = useMemo(
		() => lineValues.reduce((sum, lv) => sum + (lv.subtotal ?? 0), 0),
		[lineValues],
	);

	const isValid = useMemo(
		() =>
			!!employeeId &&
			lines.length > 0 &&
			lines.every(
				(line, i) =>
					line.categoryId !== null &&
					lineValues[i]!.rate !== null &&
					lineValues[i]!.units > 0,
			),
		[employeeId, lines, lineValues],
	);

	const hasChanges = useMemo(() => {
		if (employeeId !== null) return true;
		if (lines.length !== 1) return true;
		const [first] = lines;
		return first!.categoryId !== null || first!.units !== "";
	}, [employeeId, lines]);

	const utils = api.useUtils();
	const createPayslip = api.payslip.create.useMutation({
		onSuccess: async (payslip) => {
			await utils.payslip.list.invalidate();
			setLines([{ categoryId: null, units: "" }]);
			setSuccessMsg(`Payslip #${payslip.id} created — total ${formatDollars(total)}`);
			setTimeout(() => setSuccessMsg(null), 4000);
		},
	});

	function setEmployeeId(id: number | null) {
		createPayslip.reset();
		setEmployeeIdRaw(id);
		setLines([{ categoryId: null, units: "" }]);
	}

	function setPayslipDate(date: string) {
		createPayslip.reset();
		setDateOverride(date);
	}

	function addLine() {
		createPayslip.reset();
		setLines((prev) => [...prev, { categoryId: null, units: "" }]);
	}

	function removeLine(i: number) {
		createPayslip.reset();
		setLines((prev) => prev.filter((_, idx) => idx !== i));
	}

	function updateLine(i: number, patch: Partial<LineItem>) {
		createPayslip.reset();
		setLines((prev) => prev.map((line, idx) => (idx === i ? { ...line, ...patch } : line)));
	}

	function discardChanges() {
		setEmployeeIdRaw(null);
		setDateOverride(null);
		setLines([{ categoryId: null, units: "" }]);
		setSuccessMsg(null);
		createPayslip.reset();
	}

	function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!employeeId || !isValid) return;
		createPayslip.mutate({
			employeeId,
			date: payslipDate,
			lines: lines.map((l) => ({ categoryId: l.categoryId!, units: parseInt(l.units) })),
		});
	}

	return {
		// data
		employees,
		categories,
		// form state
		employeeId,
		payslipDate,
		lines,
		lineValues,
		usedCategories,
		total,
		isValid,
		hasChanges,
		successMsg,
		// mutation state
		isPending: createPayslip.isPending,
		isError: createPayslip.isError,
		errorMessage: createPayslip.error?.message,
		// handlers
		setEmployeeId,
		setPayslipDate,
		addLine,
		removeLine,
		updateLine,
		discardChanges,
		handleSubmit,
	};
}
