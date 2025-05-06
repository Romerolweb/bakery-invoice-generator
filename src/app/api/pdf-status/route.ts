// src/app/api/pdf-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getReceiptPdfPath } from '@/lib/data-access/receipts'; // Import from data-access layer
import { logger } from '@/lib/services/logging';
import { recordChange } from '@/lib/recordChanges'; // Import change recorder

const LOG_PREFIX = 'PdfStatusApi';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const receiptId = searchParams.get('id');
  const funcPrefix = `${LOG_PREFIX}:${receiptId || 'no-id'}`;

  logger.info(funcPrefix, `Received request to check PDF status.`);
  recordChange('src/app/api/pdf-status/route.ts', 'No code changes, but logging setup potentially affects behavior.'); // Record the 'change' context


  if (!receiptId) {
    logger.warn(funcPrefix, 'Request failed: Missing receipt ID.');
    return new NextResponse('Missing receipt ID', { status: 400 });
  }

  // Optional: Add validation for receiptId format (e.g., UUID)
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(receiptId)) {
       logger.warn(funcPrefix, 'Request failed: Invalid receipt ID format.');
       return new NextResponse('Invalid receipt ID format', { status: 400 });
  }
  logger.debug(funcPrefix, 'Receipt ID format valid.');


  try {
    logger.debug(funcPrefix, `Attempting to get PDF path for receipt ${receiptId}...`);
    // Use the data-access function directly
    const pdfPath = await getReceiptPdfPath(receiptId); // Relies on logging within the action

    if (pdfPath) {
      logger.info(funcPrefix, `PDF status is 'ready'. Path (internal): ${pdfPath}`);
      // Don't return the actual server path to the client for security.
      return NextResponse.json({ status: 'ready' });
    } else {
      // This means the file wasn't found by getReceiptPdfPath.
      // It could be still generating, or generation failed, or it never existed.
      // Logging within getReceiptPdfPath should indicate if ENOENT or other error.
      logger.info(funcPrefix, `PDF status is 'not_found' (file does not exist or access error).`);
      // Return 'not_found' instead of 'generating' as we don't know the actual status
      return NextResponse.json({ status: 'not_found' });
    }
  } catch (error) {
    // Catch unexpected errors during the check process
    logger.error(funcPrefix, `Unexpected error checking PDF status for receipt ${receiptId}`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
