import { ReceiptWebView } from '../../../components/receipts/ReceiptWebView'; // Corrected import path
import './print.css'; // Specific print styles for this view

interface ReceiptPrintViewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReceiptPrintViewPage({ params }: ReceiptPrintViewPageProps) {
  const { id } = await params;
  return (
    // Add a wrapper div that can be styled for screen viewing if needed,
    // and will be targeted by print styles for print-specific adjustments.
    <div className="receipt-print-container receipt-print-container-screen">
      <ReceiptWebView receiptId={id} />
    </div>
  );
}

export async function generateMetadata({ params }: ReceiptPrintViewPageProps) {
  const { id } = await params;
  return {
    title: `Print Receipt ${id} - Bakery Invoice Generator`,
    description: `Printable view of receipt ${id}`,
  };
}
