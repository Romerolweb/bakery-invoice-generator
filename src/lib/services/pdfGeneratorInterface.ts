// src/lib/services/pdfGeneratorInterface.ts
import type { Receipt } from '@/lib/types';

export interface PdfGenerationResult {
  success: boolean;
  message?: string;
  filePath?: string; // Path where the PDF was saved on the server
}

/**
 * Interface defining the contract for different PDF generation strategies.
 */
export interface IPdfGenerator {
  /**
   * Generates a PDF document for the given receipt data.
   * @param receipt - The full receipt data object.
   * @param operationId - A unique identifier for the generation operation (used for logging).
   * @returns A promise that resolves with the generation result (success status, optional message, and file path).
   */
  generate(receipt: Receipt, operationId: string): Promise<PdfGenerationResult>;
}
