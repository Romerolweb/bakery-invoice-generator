// src/app/api/download-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getReceiptPdfContent } from '@/lib/actions/receipts'; // Assuming this function reads the PDF buffer
import path from 'path';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const receiptId = searchParams.get('id');

  if (!receiptId) {
    return new NextResponse('Missing receipt ID', { status: 400 });
  }

  // Basic validation for receiptId format (e.g., UUID) might be added here
  // for security to prevent path traversal attempts.
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(receiptId)) {
       return new NextResponse('Invalid receipt ID format', { status: 400 });
  }


  try {
    const pdfBuffer = await getReceiptPdfContent(receiptId);

    if (!pdfBuffer) {
      return new NextResponse('PDF not found', { status: 404 });
    }

    // Determine filename (optional, browser might infer)
    const filename = `${receiptId}.pdf`;

    // Set headers for file download
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Content-Length', pdfBuffer.length.toString());

    return new NextResponse(pdfBuffer, { status: 200, headers });
  } catch (error) {
    console.error(`Error fetching PDF for receipt ${receiptId}:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
