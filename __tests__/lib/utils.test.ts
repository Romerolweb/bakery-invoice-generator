import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDate } from '@/lib/utils';

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
