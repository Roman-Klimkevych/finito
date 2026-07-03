"use client";

import { formatDollars } from "@/lib/format";
import { Button, Input, Select } from "../ui";
import { type LineItem } from "./usePayslipForm";

interface LineValue {
	rate: number | null;
	units: number;
	subtotal: number | null;
}

interface Props {
	line: LineItem;
	lineValue: LineValue;
	categories: { id: number; name: string }[] | undefined;
	usedCategories: Set<number | null>;
	isOnly: boolean;
	onChange: (patch: Partial<LineItem>) => void;
	onRemove: () => void;
}

export function PayslipLineItem({
	line,
	lineValue,
	categories,
	usedCategories,
	isOnly,
	onChange,
	onRemove,
}: Props) {
	const noRate = line.categoryId !== null && lineValue.rate === null;

	return (
		<div className="grid grid-cols-[1fr_80px_100px_100px_32px] items-center gap-2">
			<Select
				value={line.categoryId ?? ""}
				onChange={(e) =>
					onChange({
						categoryId: e.target.value ? Number(e.target.value) : null,
					})
				}
			>
				<option value="">Pick category…</option>
				{categories?.map((cat) => (
					<option
						key={cat.id}
						value={cat.id}
						disabled={usedCategories.has(cat.id) && cat.id !== line.categoryId}
					>
						{cat.name}
					</option>
				))}
			</Select>

			<Input
				type="number"
				min="1"
				step="1"
				placeholder="0"
				value={line.units}
				onChange={(e) => onChange({ units: e.target.value })}
				inputSize="sm"
			/>

			<span
				className={`font-mono text-sm ${
					noRate ? "text-red-500" : "text-gray-600"
				}`}
			>
				{line.categoryId === null
					? "—"
					: noRate
					? "no rate"
					: lineValue.rate !== null
					? formatDollars(lineValue.rate)
					: "—"}
			</span>

			<span className="font-mono text-sm text-gray-900">
				{lineValue.subtotal !== null ? formatDollars(lineValue.subtotal) : "—"}
			</span>

			<Button
				type="button"
				variant="icon"
				onClick={onRemove}
				disabled={isOnly}
				aria-label="Remove line"
			>
				✕
			</Button>
		</div>
	);
}
