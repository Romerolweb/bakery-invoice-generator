import { ReceiptWebView } from '../../../components/receipts/ReceiptWebView';
import './print.css';

interface ReceiptViewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReceiptViewPage({ params }: ReceiptViewPageProps) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-white">
      <ReceiptWebView receiptId={id} />
    </div>
  );
}

export async function generateMetadata({ params }: ReceiptViewPageProps) {
  const { id } = await params;
  return {
    title: `Receipt ${id} - Bakery Invoice Generator`,
    description: `View and print receipt ${id}`,
  };
}
