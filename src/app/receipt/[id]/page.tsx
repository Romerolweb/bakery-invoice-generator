import { ReceiptWebView } from '@/components/receipts/ReceiptWebView';
import './print.css';

interface ReceiptViewPageProps {
  params: { id: string };
}

export default function ReceiptViewPage({ params }: ReceiptViewPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <ReceiptWebView receiptId={params.id} />
    </div>
  );
}

export async function generateMetadata({ params }: ReceiptViewPageProps) {
  return {
    title: `Receipt ${params.id} - Bakery Invoice Generator`,
    description: `View and print receipt ${params.id}`,
  };
}
