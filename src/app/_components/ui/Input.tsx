import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "./cn";

export type InputSize = "sm" | "md";

const sizeClasses: Record<InputSize, string> = {
	sm: "px-2 py-1.5",
	md: "px-3 py-1.5",
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	inputSize?: InputSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
	({ inputSize = "md", className, ...props }, ref) => (
		<input
			ref={ref}
			{...props}
			className={cn(
				"rounded border border-gray-300 text-sm focus:border-blue-500 focus:outline-none [&::-webkit-calendar-picker-indicator]:cursor-pointer",
				sizeClasses[inputSize],
				className
			)}
		/>
	)
);
Input.displayName = "Input";
