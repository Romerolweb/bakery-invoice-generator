interface ReceiptTotalsProps {
  subtotal: number;
  gstAmount: number;
  total: number;
  showGST: boolean;
}

export function ReceiptTotals({ subtotal, gstAmount, total, showGST }: ReceiptTotalsProps) {
  return (
    <div className="flex justify-end" data-testid="receipt-totals">
      <div className="w-64 space-y-2">
        <div className="flex justify-between py-1">
          <span>Subtotal:</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        
        {showGST && (
          <div className="flex justify-between py-1">
            <span>GST (10%):</span>
            <span>${gstAmount.toFixed(2)}</span>
          </div>
        )}
        
        <div className="flex justify-between py-2 border-t border-gray-300 font-bold text-lg">
          <span>Total:</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
