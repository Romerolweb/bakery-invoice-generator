// src/app/api/pdf-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getReceiptPdfPath } from '@/lib/data-access/receipts'; // Import from data-access layer
import { logger } from '@/lib/services/logging';

const LOG_PREFIX = 'PdfStatusApi';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const receiptId = searchParams.get('id');
  const funcPrefix = `${LOG_PREFIX}:${receiptId || 'no-id'}`;

  logger.info(funcPrefix, `Received request to check PDF status.`);

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
    const pdfPath = await getReceiptPdfPath(receiptId);

    if (pdfPath) {
      logger.info(funcPrefix, `PDF status is 'ready'. Path: ${pdfPath}`);
      // Don't return the actual server path to the client for security.
      return NextResponse.json({ status: 'ready' });
    } else {
      // This means the file wasn't found by getReceiptPdfPath.
      // It could be still generating, or generation failed, or it never existed.
      // For simplicity, we'll return 'not_found'. A more complex system
      // might track generation state separately.
      logger.info(funcPrefix, `PDF status is 'not_found' (file does not exist).`);
      return NextResponse.json({ status: 'not_found' });
    }
  } catch (error) {
    logger.error(funcPrefix, `Error checking PDF status for receipt ${receiptId}`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
