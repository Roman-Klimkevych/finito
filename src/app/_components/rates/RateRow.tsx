"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { formatDollars } from "@/lib/format";
import { Button, Input, cn } from "../ui";

interface Props {
	employeeId: number;
	category: { id: number; name: string };
	amountCents: number | null;
	effectiveDate: string;
}

export function RateRow({ employeeId, category, amountCents, effectiveDate }: Props) {
	const [editing, setEditing] = useState(false);
	const [input, setInput] = useState(
		amountCents !== null ? (amountCents / 100).toFixed(2) : "",
	);

	const utils = api.useUtils();
	const setRate = api.rate.set.useMutation({
		onSuccess: async () => {
			await Promise.all([
				utils.rate.listForEmployee.invalidate(),
				utils.payslip.list.invalidate(),
			]);
			setEditing(false);
		},
	});

	function handleSave() {
		const parsed = parseFloat(input);
		if (isNaN(parsed) || parsed < 0) return;
		setRate.mutate({
			employeeId,
			categoryId: category.id,
			effectiveDate,
			amountCents: Math.round(parsed * 100),
		});
	}

	function handleCancel() {
		setEditing(false);
		setInput(amountCents !== null ? (amountCents / 100).toFixed(2) : "");
	}

	function startEditing() {
		setInput(amountCents !== null ? (amountCents / 100).toFixed(2) : "");
		setEditing(true);
	}

	return (
		<tr className="border-b border-gray-100 last:border-0">
			<td className="py-3 pr-4 text-sm text-gray-700">{category.name}</td>

			<td className="py-3 pr-4 text-sm">
				{editing ? (
					<div className="flex items-center gap-1.5">
						<span className="text-gray-500">$</span>
						<Input
							type="number"
							step="0.01"
							min="0"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") { e.preventDefault(); handleSave(); }
								if (e.key === "Escape") handleCancel();
							}}
							inputSize="sm"
							className="w-28"
							autoFocus
						/>
					</div>
				) : (
					<span
						onClick={startEditing}
						className={cn(
							"inline-flex h-[34px] cursor-pointer items-center rounded px-2 hover:bg-gray-50 hover:ring-1 hover:ring-gray-300",
							amountCents === null ? "text-gray-400" : "font-mono text-gray-900",
						)}
					>
						{amountCents === null ? "—" : formatDollars(amountCents)}
					</span>
				)}
			</td>

			<td className="py-3 text-right">
				{editing ? (
					<div className="inline-flex h-[34px] items-center justify-end gap-1.5">
						<Button variant="primary" size="xs" onClick={handleSave} disabled={setRate.isPending}>
							{setRate.isPending ? "Saving…" : "Save"}
						</Button>
						<Button variant="secondary" size="xs" onClick={handleCancel}>
							Cancel
						</Button>
					</div>
				) : (
					<div className="inline-flex h-[34px] items-center justify-end">
						<Button type="button" variant="ghost" size="xs" onClick={startEditing}>
							{amountCents === null ? "Set rate" : "Edit"}
						</Button>
					</div>
				)}
			</td>
		</tr>
	);
}
