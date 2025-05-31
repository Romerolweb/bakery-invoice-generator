import { NextRequest, NextResponse } from 'next/server';
import { getReceiptById } from '@/lib/actions/receipts';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const receiptId = params.id;
    
    if (!receiptId) {
      return NextResponse.json(
        { success: false, error: 'Receipt ID is required' },
        { status: 400 }
      );
    }

    const receipt = await getReceiptById(receiptId);
    
    if (!receipt) {
      return NextResponse.json(
        { success: false, error: 'Receipt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: receipt
    });

  } catch (error) {
    console.error('Error fetching receipt:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
