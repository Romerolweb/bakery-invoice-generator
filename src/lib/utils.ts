import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines and merges Tailwind CSS classes and other class values.
 * Uses `clsx` to handle conditional classes and `tailwind-merge` to resolve conflicts.
 * @param inputs - An array of ClassValue (string, array of strings, object, etc.)
 * @returns A single, merged string of CSS classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
