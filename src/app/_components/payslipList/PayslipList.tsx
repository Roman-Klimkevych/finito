"use client";

import { Fragment, useState } from "react";
import { api } from "@/trpc/react";
import { formatDollars } from "@/lib/format";
import { Button } from "../ui";
import { useDismissPopover } from "./useDismissPopover";
import { PayslipDetailRow } from "./PayslipDetailRow";

export function PayslipList() {
	const { data: payslips, isLoading } = api.payslip.list.useQuery();
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

	const {
		open: openDismiss,
		isOpen: isDismissOpen,
		portal: dismissPortal,
	} = useDismissPopover();

	const utils = api.useUtils();
	const deletePayslip = api.payslip.delete.useMutation({
		onSuccess: (_, { payslipId }) => {
			setConfirmDeleteId(null);
			setExpandedId(null);
			// The server confirmed the delete — remove from cache directly rather
			// than refetching, which would hit the browser HTTP cache on a GET.
			utils.payslip.list.setData(undefined, (old) =>
				old?.filter((p) => p.id !== payslipId) ?? [],
			);
		},
	});

	return (
		<>
			{dismissPortal}

			<section className="rounded-lg border border-gray-200 bg-white shadow-sm">
				<div className="border-b border-gray-200 px-6 py-4">
					<h2 className="text-base font-semibold text-gray-900">Payslips</h2>
				</div>

				{isLoading ? (
					<div className="space-y-3 p-6">
						{[1, 2, 3].map((i) => (
							<div key={i} className="h-5 animate-pulse rounded bg-gray-100" />
						))}
					</div>
				) : !payslips?.length ? (
					<div className="flex flex-col items-center gap-1 py-10 text-sm text-gray-400">
						<span>No payslips yet.</span>
						<span>Create one using the form above ↑</span>
					</div>
				) : (
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
								<th className="w-6 px-3 py-3" />
								<th className="px-4 py-3">Employee</th>
								<th className="px-4 py-3">Date</th>
								<th className="px-4 py-3 text-right">Original total</th>
								<th className="px-4 py-3 text-right">Current total</th>
								<th className="px-4 py-3" />
								<th className="px-4 py-3" />
							</tr>
						</thead>
						<tbody>
							{payslips.map((p) => {
								const isExpanded = expandedId === p.id;
								const rowBase = p.isRetroactive
									? "border-b border-amber-100 bg-amber-50"
									: "border-b border-gray-100";

								return (
									<Fragment key={p.id}>
										<tr
											onClick={() => setExpandedId(isExpanded ? null : p.id)}
											className={`${rowBase} cursor-pointer select-none hover:brightness-[0.97] ${
												isExpanded ? "" : "last:border-0"
											}`}
										>
											<td className="px-3 py-3 text-gray-400">
												<svg
													className={`h-3.5 w-3.5 transition-transform ${
														isExpanded ? "rotate-90" : ""
													}`}
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={2.5}
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M9 5l7 7-7 7"
													/>
												</svg>
											</td>
											<td className="px-4 py-3 font-medium text-gray-800">
												{p.employee.name}
											</td>
											<td className="px-4 py-3 text-gray-600">{p.date}</td>
											<td className="px-4 py-3 text-right font-mono text-gray-700">
												{formatDollars(p.originalTotal)}
											</td>
											<td
												className={`px-4 py-3 text-right font-mono ${
													p.isRetroactive
														? "font-semibold text-amber-700"
														: "text-gray-700"
												}`}
											>
												{formatDollars(p.currentTotal)}
											</td>
											<td
												className="px-4 py-3 text-right"
												onClick={(e) => e.stopPropagation()}
											>
												{p.isRetroactive && (
													<div className="flex items-center justify-end gap-2">
														<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
															⚠ Changed
														</span>
														{p.hasDismissibleChange && (
															<Button
																variant="amber"
																onClick={(e) => openDismiss(e, p.id)}
																className={
																	isDismissOpen(p.id)
																		? "ring-2 ring-amber-400"
																		: ""
																}
															>
																Dismiss
															</Button>
														)}
													</div>
												)}
											</td>
											<td
												className="px-4 py-3 text-right"
												onClick={(e) => e.stopPropagation()}
											>
												{confirmDeleteId === p.id ? (
													<span className="inline-flex items-center gap-1.5 text-xs">
														<span className="text-gray-500">Delete?</span>
														<Button
															variant="danger"
															onClick={() =>
																deletePayslip.mutate({ payslipId: p.id })
															}
															disabled={deletePayslip.isPending}
														>
															{deletePayslip.isPending ? "Deleting…" : "Yes"}
														</Button>
														<Button
															variant="muted"
															onClick={() => setConfirmDeleteId(null)}
														>
															No
														</Button>
													</span>
												) : (
													<Button
														variant="icon"
														onClick={() => setConfirmDeleteId(p.id)}
														className="text-gray-300"
														aria-label="Delete payslip"
													>
														<svg
															className="h-4 w-4"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															strokeWidth={1.5}
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
															/>
														</svg>
													</Button>
												)}
											</td>
										</tr>

										{isExpanded && (
											<PayslipDetailRow
												payslipId={p.id}
												isRetroactive={p.isRetroactive}
												lines={p.lines}
												onDismiss={openDismiss}
												isDismissOpen={isDismissOpen}
											/>
										)}
									</Fragment>
								);
							})}
						</tbody>
					</table>
				)}
			</section>
		</>
	);
}
