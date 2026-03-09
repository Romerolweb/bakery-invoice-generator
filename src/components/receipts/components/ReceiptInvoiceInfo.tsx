interface ReceiptInvoiceInfoProps {
  receiptId: string;
  date: string;
  isInvoice: boolean;
}

export function ReceiptInvoiceInfo({ receiptId, date, isInvoice }: ReceiptInvoiceInfoProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString;
      }
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 border-y" data-testid="receipt-invoice-info">
      <div>
        <span className="font-semibold">{isInvoice ? 'Invoice' : 'Receipt'} #: </span>
        <span>{receiptId}</span>
      </div>
      <div>
        <span className="font-semibold">Date: </span>
        <span>{formatDate(date)}</span>
      </div>
    </div>
  );
}
