import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from 'date-fns';

/**
 * Combines and merges Tailwind CSS classes and other class values.
 * Uses `clsx` to handle conditional classes and `tailwind-merge` to resolve conflicts.
 * @param inputs - An array of ClassValue (string, array of strings, object, etc.)
 * @returns A single, merged string of CSS classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats an ISO date string to DD/MM/YYYY format.
 * @param dateString - The ISO date string to format.
 * @returns A formatted date string (DD/MM/YYYY), 'N/A' if input is null/undefined, or 'Invalid Date' if parsing fails.
 */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) {
    return 'N/A';
  }
  try {
    const date = parseISO(dateString);
    return format(date, 'dd/MM/yyyy');
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return 'Invalid Date'; // Returns error message for invalid date strings
  }
}

/**
 * Escapes special HTML characters in a string to prevent XSS.
 * @param str - The string to escape.
 * @returns The escaped string.
 */
export function escapeHTML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
