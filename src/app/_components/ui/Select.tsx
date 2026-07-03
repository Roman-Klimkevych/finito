import { forwardRef, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export type SelectSize = "sm" | "md";

const sizeClasses: Record<SelectSize, string> = {
	sm: "py-1.5 pl-2 pr-6",
	md: "h-[34px] pl-3 pr-8",
};

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
	selectSize?: SelectSize;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
	({ selectSize = "md", className, ...props }, ref) => (
		<div className={cn("relative inline-block", className)}>
			<select
				ref={ref}
				{...props}
				className={cn(
					"w-full cursor-pointer appearance-none rounded border border-gray-300 text-sm focus:border-blue-500 focus:outline-none",
					sizeClasses[selectSize],
				)}
			/>
			<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</span>
		</div>
	)
);
Select.displayName = "Select";
