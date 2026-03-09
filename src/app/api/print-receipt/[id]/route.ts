import { getReceiptById } from "@/lib/actions/receipts";
import { NextRequest, NextResponse } from "next/server";
import { Receipt } from "@/lib/types";
import { generateReceiptHTML } from "@/lib/receipt-templates";

// Disable caching for this route
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: receiptId } = await params;

  if (!receiptId) {
    return new NextResponse("Receipt ID is required", { status: 400 });
  }

  try {
    const receiptResult = await getReceiptById(receiptId);

    if (!receiptResult || !receiptResult.receipt_id || !receiptResult.date_of_purchase) {
      return new NextResponse("Receipt not found or error fetching receipt", {
        status: 404,
      });
    }

    const htmlContent = generateReceiptHTML(receiptResult as Receipt);
    // Set the content type to HTML and return the generated HTML

    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error(`Error generating print receipt for ID ${receiptId}:`, error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
