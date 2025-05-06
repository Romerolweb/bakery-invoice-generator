// src/app/api/download-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getReceiptPdfContent } from '@/lib/data-access/receipts'; // Assuming this function reads the PDF buffer
import { logger } from '@/lib/services/logging';

const LOG_PREFIX = 'DownloadPdfApi';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const receiptId = searchParams.get('id');
  const funcPrefix = `${LOG_PREFIX}:${receiptId || 'no-id'}`;

  logger.info(funcPrefix, `Received request to download PDF.`);

  if (!receiptId) {
    logger.warn(funcPrefix, 'Request failed: Missing receipt ID.');
    return new NextResponse('Missing receipt ID', { status: 400 });
  }

  // Basic validation for receiptId format (e.g., UUID) might be added here
  // for security to prevent path traversal attempts.
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(receiptId)) {
       logger.warn(funcPrefix, 'Request failed: Invalid receipt ID format.');
       return new NextResponse('Invalid receipt ID format', { status: 400 });
  }
  logger.debug(funcPrefix, 'Receipt ID format valid.');


  try {
    logger.debug(funcPrefix, `Attempting to get PDF content for receipt ${receiptId}...`);
    const pdfBuffer = await getReceiptPdfContent(receiptId); // Relies on logging within the action

    if (!pdfBuffer) {
      // Logged within getReceiptPdfContent if file not found or read error
      logger.warn(funcPrefix, 'PDF content not found or could not be read for receipt.');
      return new NextResponse('PDF not found or unreadable', { status: 404 });
    }
    logger.info(funcPrefix, `PDF content retrieved (${pdfBuffer.length} bytes).`);

    // Determine filename (optional, browser might infer)
    const filename = `invoice-${receiptId}.pdf`; // Changed filename prefix

    // Set headers for file download
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Content-Length', pdfBuffer.length.toString());

    logger.info(funcPrefix, 'Sending PDF content as response.');
    return new NextResponse(pdfBuffer, { status: 200, headers });
  } catch (error) {
    // Catch unexpected errors during the process
    logger.error(funcPrefix, `Unexpected error processing PDF download for receipt ${receiptId}`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
