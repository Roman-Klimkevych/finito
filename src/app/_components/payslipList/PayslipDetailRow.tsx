"use client";

import { formatDollars } from "@/lib/format";
import { Button } from "../ui";
import { type PayslipLine } from "./types";

export function PayslipDetailRow({
	payslipId,
	isRetroactive,
	lines,
	onDismiss,
	isDismissOpen,
}: {
	payslipId: number;
	isRetroactive: boolean;
	lines: PayslipLine[];
	onDismiss: (
		e: React.MouseEvent<HTMLButtonElement>,
		payslipId: number,
		categoryId: number
	) => void;
	isDismissOpen: (payslipId: number, categoryId?: number) => boolean;
}) {
	return (
		<tr
			className={`${
				isRetroactive ? "bg-amber-50/60" : "bg-gray-50/60"
			} border-b border-gray-100 last:border-0`}
		>
			<td />
			<td colSpan={6} className="px-4 pb-4 pt-2">
				<table className="w-full text-xs">
					<thead>
						<tr className="text-left text-gray-400">
							<th className="pb-1.5 font-medium">Category</th>
							<th className="pb-1.5 text-right font-medium">Units</th>
							<th className="pb-1.5 text-right font-medium">
								Rate at creation
							</th>
							<th className="pb-1.5 text-right font-medium">Current rate</th>
							<th className="pb-1.5 text-right font-medium">
								Subtotal (original)
							</th>
							<th className="pb-1.5 text-right font-medium">
								Subtotal (current)
							</th>
							<th className="pb-1.5 font-medium" />
						</tr>
					</thead>
					<tbody>
						{lines.map((l, i) => {
							const rateChanged = l.currentRateCents !== l.rateCentsAtCreation;
							return (
								<tr key={i} className="border-t border-gray-100">
									<td className="py-1.5 font-medium text-gray-700">
										{l.categoryName}
									</td>
									<td className="py-1.5 text-right font-mono text-gray-600">
										{l.units}
									</td>
									<td className="py-1.5 text-right font-mono text-gray-600">
										{formatDollars(l.rateCentsAtCreation)}
									</td>
									<td
										className={`py-1.5 text-right font-mono ${
											rateChanged
												? "font-semibold text-amber-700"
												: "text-gray-600"
										}`}
									>
										{formatDollars(l.currentRateCents)}
										{rateChanged && (
											<span className="ml-1 text-amber-500">
												({l.currentRateCents > l.rateCentsAtCreation ? "+" : ""}
												{formatDollars(
													l.currentRateCents - l.rateCentsAtCreation
												)}
												)
											</span>
										)}
									</td>
									<td className="py-1.5 text-right font-mono text-gray-600">
										{formatDollars(l.rateCentsAtCreation * l.units)}
									</td>
									<td
										className={`py-1.5 text-right font-mono ${
											rateChanged
												? "font-semibold text-amber-700"
												: "text-gray-600"
										}`}
									>
										{formatDollars(l.currentRateCents * l.units)}
									</td>
									<td className="py-1.5 pl-3 text-right">
										{rateChanged && l.hasDismissibleChange && (
											<Button
												variant="amber"
												onClick={(e) => onDismiss(e, payslipId, l.categoryId)}
												className={`px-2 ${
													isDismissOpen(payslipId, l.categoryId)
														? "ring-2 ring-amber-400"
														: ""
												}`}
											>
												Dismiss
											</Button>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</td>
		</tr>
	);
}
