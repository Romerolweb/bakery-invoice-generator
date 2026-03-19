import { describe, it, expect, vi, afterEach } from "vitest";
import { escapeHTML, formatDate } from "@/lib/formatters";

describe("escapeHTML", () => {
  it("should escape special HTML characters correctly", () => {
    expect(escapeHTML("&")).toBe("&amp;");
    expect(escapeHTML("<")).toBe("&lt;");
    expect(escapeHTML(">")).toBe("&gt;");
    expect(escapeHTML('"')).toBe("&quot;");
    expect(escapeHTML("'")).toBe("&#039;");
  });

  it("should escape a string with mixed special characters", () => {
    const input = '<div>"Hello" & \'World\'</div>';
    const expected = "&lt;div&gt;&quot;Hello&quot; &amp; &#039;World&#039;&lt;/div&gt;";
    expect(escapeHTML(input)).toBe(expected);
  });

  it("should handle common XSS patterns", () => {
    const scriptTag = "<script>alert('XSS')</script>";
    expect(escapeHTML(scriptTag)).toBe("&lt;script&gt;alert(&#039;XSS&#039;)&lt;/script&gt;");

    const imgTag = '<img src="x" onerror="alert(1)">';
    expect(escapeHTML(imgTag)).toBe("&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;");
  });

  it("should return an empty string for empty input", () => {
    expect(escapeHTML("")).toBe("");
  });

  it("should return an empty string for null or undefined input", () => {
    expect(escapeHTML(null as any)).toBe("");
    expect(escapeHTML(undefined as any)).toBe("");
  });

  it("should return the same string if no special characters are present", () => {
    expect(escapeHTML("Hello World")).toBe("Hello World");
    expect(escapeHTML("12345")).toBe("12345");
  });
});

describe("formatDate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should format a valid ISO date string correctly", () => {
    const dateString = "2023-10-27T10:00:00";
    expect(formatDate(dateString)).toBe("27/10/2023");
  });

  it('should return "N/A" for null input', () => {
    expect(formatDate(null)).toBe("N/A");
  });

  it('should return "N/A" for undefined input', () => {
    expect(formatDate(undefined)).toBe("N/A");
  });

  it('should return "N/A" for empty string input', () => {
    expect(formatDate("")).toBe("N/A");
  });

  it('should return "Invalid Date" for invalid date string and log error', () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(formatDate("invalid-date")).toBe("Invalid Date");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error formatting date:",
      "invalid-date",
      expect.any(Error),
    );
  });
});
