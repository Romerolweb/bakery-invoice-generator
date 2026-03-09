interface ReceiptHeaderProps {
  isInvoice: boolean;
}

export function ReceiptHeader({ isInvoice }: ReceiptHeaderProps) {
  return (
    <div className="text-center border-b pb-4" data-testid="receipt-header">
      <h1 className="text-3xl font-bold text-gray-900">
        {isInvoice ? 'TAX INVOICE' : 'RECEIPT'}
      </h1>
      <p className="text-gray-600 mt-2">Bakery Invoice Generator</p>
    </div>
  );
}
