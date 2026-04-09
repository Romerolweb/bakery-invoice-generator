import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getReceiptPdfPath, getReceiptPdfContent } from '@/lib/data-access/receipts';
import fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');
vi.mock('@/lib/services/logging');
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      receipts: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => ({
        from: vi.fn(() => ({
            where: vi.fn(() => [])
        }))
    })),
    transaction: vi.fn(),
  },
}));

describe('Receipts Data Access - Security Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getReceiptPdfPath', () => {
    it('should return null for malicious path traversal receiptId', async () => {
      const maliciousId = '../../../etc/passwd';
      const result = await getReceiptPdfPath(maliciousId);

      expect(result).toBeNull();
      expect(fs.access).not.toHaveBeenCalled();
    });

    it('should return null for non-UUID receiptId', async () => {
      const invalidId = 'not-a-uuid';
      const result = await getReceiptPdfPath(invalidId);

      expect(result).toBeNull();
      expect(fs.access).not.toHaveBeenCalled();
    });

    it('should proceed for valid UUID receiptId', async () => {
      const validId = '550e8400-e29b-41d4-a716-446655440000';
      // Mock fs.access to succeed
      (fs.access as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const result = await getReceiptPdfPath(validId);

      expect(result).not.toBeNull();
      expect(result).toContain(validId);
      expect(result).toMatch(/\.pdf$/);
      expect(fs.access).toHaveBeenCalled();
    });
  });

  describe('getReceiptPdfContent', () => {
    it('should return null for malicious path traversal receiptId', async () => {
      const maliciousId = '../../../etc/passwd';
      const result = await getReceiptPdfContent(maliciousId);

      expect(result).toBeNull();
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should call fs.readFile with validated path for valid UUID', async () => {
        const validId = '550e8400-e29b-41d4-a716-446655440000';
        const mockBuffer = Buffer.from('pdf content');

        // Mock getReceiptPdfPath to return a path (by mocking its dependencies)
        (fs.access as any).mockResolvedValue(undefined);
        (fs.mkdir as any).mockResolvedValue(undefined);
        (fs.readFile as any).mockResolvedValue(mockBuffer);

        const result = await getReceiptPdfContent(validId);

        expect(result).toEqual(mockBuffer);
        expect(fs.readFile).toHaveBeenCalled();
        const calledPath = (fs.readFile as any).mock.calls[0][0];
        expect(calledPath).toContain(validId);
        expect(path.isAbsolute(calledPath)).toBe(true);
    });
  });
});
