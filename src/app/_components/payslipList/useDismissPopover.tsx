"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { api } from "@/trpc/react";
import { formatDollars } from "@/lib/format";
import { Button } from "../ui";

export function useDismissPopover() {
	const [pending, setPending] = useState<{
		payslipId: number;
		categoryId?: number;
	} | null>(null);
	const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

	const { data: peekChange, isLoading: peekLoading } =
		api.payslip.peekNextDismissibleChange.useQuery(pending!, {
			enabled: pending !== null,
		});

	const utils = api.useUtils();
	const dismiss = api.payslip.dismissLatestChange.useMutation({
		onSuccess: async () => {
			setPending(null);
			// Cancellation is global: it can move other payslips' totals and the
			// rate shown in the rates panel, so refresh both.
			await Promise.all([
				utils.payslip.list.invalidate(),
				utils.rate.listForEmployee.invalidate(),
			]);
		},
	});

	function open(
		e: React.MouseEvent<HTMLButtonElement>,
		payslipId: number,
		categoryId?: number
	) {
		e.stopPropagation();
		setAnchorRect(e.currentTarget.getBoundingClientRect());
		setPending({ payslipId, categoryId });
	}

	function close() {
		setPending(null);
	}

	function isOpen(payslipId: number, categoryId?: number) {
		return (
			pending !== null &&
			pending.payslipId === payslipId &&
			pending.categoryId === categoryId
		);
	}

	const portal =
		pending && anchorRect
			? createPortal(
					<>
						<div className="fixed inset-0 z-40" onClick={close} />
						<div
							className="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
							style={{
								bottom: window.innerHeight - anchorRect.top + 6,
								right: window.innerWidth - anchorRect.right,
							}}
							onClick={(e) => e.stopPropagation()}
						>
							<p className="mb-2 text-xs font-semibold text-gray-700">
								Confirm dismissal
							</p>
							{peekLoading ? (
								<div className="mb-3 h-8 animate-pulse rounded bg-gray-100" />
							) : peekChange ? (
								<div className="mb-3 space-y-0.5 text-xs text-gray-600">
									<p>
										<span className="font-medium">
											{peekChange.categoryName}
										</span>{" "}
										rate was set to{" "}
										<span className="font-mono font-medium">
											{formatDollars(peekChange.amountCents)}
										</span>
									</p>
									<p className="text-gray-400">
										effective {peekChange.effectiveDate}
									</p>
								</div>
							) : (
								<p className="mb-3 text-xs text-gray-500">
									Nothing to dismiss.
								</p>
							)}
							<div className="flex justify-end gap-2">
								<Button variant="secondary" size="xs" onClick={close}>
									Cancel
								</Button>
								<Button
									variant="amber"
									size="xs"
									onClick={() => pending && dismiss.mutate(pending)}
									disabled={!peekChange || dismiss.isPending}
								>
									{dismiss.isPending ? "Dismissing…" : "Dismiss"}
								</Button>
							</div>
						</div>
					</>,
					document.body
			  )
			: null;

	return { open, close, isOpen, portal };
}
