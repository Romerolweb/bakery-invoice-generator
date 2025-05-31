import { ReceiptWebView } from '../../../components/receipts/ReceiptWebView'; // Corrected import path
import './print.css'; // Specific print styles for this view

interface ReceiptPrintViewPageProps {
  params: { id: string };
}

export default function ReceiptPrintViewPage({ params }: ReceiptPrintViewPageProps) {
  return (
    // Add a wrapper div that can be styled for screen viewing if needed,
    // and will be targeted by print styles for print-specific adjustments.
    <div className="receipt-print-container receipt-print-container-screen">
      <ReceiptWebView receiptId={params.id} />
    </div>
  );
}

export async function generateMetadata({ params }: ReceiptPrintViewPageProps) {
  return {
    title: `Print Receipt ${params.id} - Bakery Invoice Generator`,
    description: `Printable view of receipt ${params.id}`,
  };
}
