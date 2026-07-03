import { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant =
  | "primary"    // blue filled — Save, Create Payslip
  | "secondary"  // gray border — Cancel
  | "ghost"      // blue text   — Edit, Set rate, + Add line
  | "amber"      // amber border — Dismiss
  | "danger"     // red text    — confirm delete Yes
  | "muted"      // gray text   — No, Discard
  | "icon";      // gray icon, turns red on hover — ✕, trash

export type ButtonSize = "xs" | "sm";

const variantClasses: Record<ButtonVariant, string> = {
  primary:   "rounded bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-50",
  secondary: "rounded border border-gray-300 font-medium text-gray-600 hover:bg-gray-50",
  ghost:     "font-medium text-blue-600 hover:text-blue-800",
  amber:     "rounded border border-amber-300 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50",
  danger:    "font-medium text-red-600 hover:text-red-800 disabled:opacity-50",
  muted:     "text-gray-400 hover:text-gray-600",
  icon:      "text-gray-400 hover:text-red-500 disabled:opacity-30",
};

// Padded variants get full px/py; text-only variants get only font-size.
const paddedVariants = new Set<ButtonVariant>(["primary", "secondary", "amber"]);

const paddedSize: Record<ButtonSize, string> = {
  xs: "px-2.5 py-0.5 text-xs",
  sm: "px-4 py-2 text-sm",
};

const textSize: Record<ButtonSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "xs",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "cursor-pointer disabled:cursor-not-allowed",
        variantClasses[variant],
        paddedVariants.has(variant) ? paddedSize[size] : textSize[size],
        className,
      )}
    />
  );
}
