import { twMerge } from "tailwind-merge";

export function cn(...classes: (string | undefined | false | null)[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
