import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDate, escapeHTML } from '@/lib/utils';

describe('formatDate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should format a valid ISO date string correctly', () => {
    const dateString = '2023-10-27T10:00:00';
    expect(formatDate(dateString)).toBe('27/10/2023');
  });

  it('should return "N/A" for null input', () => {
    expect(formatDate(null)).toBe('N/A');
  });

  it('should return "N/A" for undefined input', () => {
    expect(formatDate(undefined)).toBe('N/A');
  });

  it('should return "N/A" for empty string input', () => {
    expect(formatDate('')).toBe('N/A');
  });

  it('should return "Invalid Date" for invalid date string and log error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(formatDate('invalid-date')).toBe('Invalid Date');
    expect(consoleSpy).toHaveBeenCalledWith("Error formatting date:", 'invalid-date', expect.any(Error));
  });
});

describe('escapeHTML', () => {
  it('should escape "&" correctly', () => {
    expect(escapeHTML('Me & You')).toBe('Me &amp; You');
  });

  it('should escape "<" correctly', () => {
    expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape ">" correctly', () => {
    expect(escapeHTML('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes correctly', () => {
    expect(escapeHTML('Hello "World"')).toBe('Hello &quot;World&quot;');
  });

  it('should escape single quotes correctly', () => {
    expect(escapeHTML("It's me")).toBe('It&#039;s me');
  });

  it('should escape multiple occurrences of special characters', () => {
    expect(escapeHTML('&&<<>>""\'\'')).toBe('&amp;&amp;&lt;&lt;&gt;&gt;&quot;&quot;&#039;&#039;');
  });

  it('should escape a complex string with mixed special characters', () => {
    const input = '<div class="test">Fish & Chips aren\'t "free"</div>';
    const expected = '&lt;div class=&quot;test&quot;&gt;Fish &amp; Chips aren&#039;t &quot;free&quot;&lt;/div&gt;';
    expect(escapeHTML(input)).toBe(expected);
  });

  it('should return an empty string for empty string input', () => {
    expect(escapeHTML('')).toBe('');
  });

  it('should return an empty string for falsy input (simulated via casting)', () => {
    // TypeScript prevents passing null/undefined if it's not in the type,
    // but the implementation handles it. Let's test with casting for safety.
    expect(escapeHTML(null as unknown as string)).toBe('');
    expect(escapeHTML(undefined as unknown as string)).toBe('');
  });

  it('should return original string if no special characters are present', () => {
    expect(escapeHTML('Hello World')).toBe('Hello World');
  });
});
