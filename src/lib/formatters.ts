/**
 * Formats an ISO date string to DD/MM/YYYY format using native Date object.
 * This avoids dependency on date-fns for basic formatting.
 * @param dateString - The ISO date string to format.
 * @returns A formatted date string (DD/MM/YYYY), 'N/A' if input is null/undefined, or 'Invalid Date' if parsing fails.
 */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) {
    return "N/A";
  }
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      console.error("Error formatting date:", dateString, new Error("Invalid Date"));
      return "Invalid Date";
    }
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return "Invalid Date";
  }
}

/**
 * Escapes special HTML characters in a string to prevent XSS.
 * @param str - The string to escape.
 * @returns The escaped string.
 */
export function escapeHTML(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
