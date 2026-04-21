import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDate as formatDateInternal, escapeHTML as escapeHTMLInternal } from "./formatters";

/**
 * Combines and merges Tailwind CSS classes and other class values.
 * Uses `clsx` to handle conditional classes and `tailwind-merge` to resolve conflicts.
 * @param inputs - An array of class values (string, array of strings, object, etc.) compatible with clsx.
 * @returns A single, merged string of CSS classes.
 */
export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(...inputs));
}

/**
 * Formats an ISO date string to DD/MM/YYYY format.
 * Proxies to the pure implementation in formatters.ts.
 * @param dateString - The ISO date string to format.
 * @returns A formatted date string (DD/MM/YYYY), 'N/A' if input is null/undefined, or 'Invalid Date' if parsing fails.
 */
export function formatDate(dateString: string | undefined | null): string {
  return formatDateInternal(dateString);
}

/**
 * Escapes special HTML characters in a string to prevent XSS.
 * Proxies to the pure implementation in formatters.ts.
 * @param str - The string to escape.
 * @returns The escaped string.
 */
export function escapeHTML(str: string): string {
  return escapeHTMLInternal(str);
}
