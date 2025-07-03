import type { Receipt } from '@/lib/types';
import { ReceiptHeader } from './ReceiptHeader';
import { ReceiptSellerInfo } from './ReceiptSellerInfo';
import { ReceiptCustomerInfo } from './ReceiptCustomerInfo';
import { ReceiptInvoiceInfo } from './ReceiptInvoiceInfo';
import { ReceiptItemsTable } from './ReceiptItemsTable';
import { ReceiptTotals } from './ReceiptTotals';
import { ReceiptFooter } from './ReceiptFooter';

interface ReceiptContentProps {
  receipt: Receipt;
}

export function ReceiptContent({ receipt }: ReceiptContentProps) {
  return (
    <div className="receipt-container max-w-4xl mx-auto p-8 bg-white">
      <div className="receipt-content space-y-6">
        <ReceiptHeader isInvoice={receipt.is_tax_invoice} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ReceiptSellerInfo seller={receipt.seller_profile_snapshot} />
          <ReceiptCustomerInfo customer={receipt.customer_snapshot} />
        </div>
        
        <ReceiptInvoiceInfo 
          receiptId={receipt.receipt_id}
          date={receipt.date_of_purchase}
          isInvoice={receipt.is_tax_invoice}
        />
        
        <ReceiptItemsTable 
          items={receipt.line_items}
          showGST={receipt.is_tax_invoice}
        />
        
        <ReceiptTotals
          subtotal={receipt.subtotal_excl_GST}
          gstAmount={receipt.GST_amount}
          total={receipt.total_inc_GST}
          showGST={receipt.is_tax_invoice}
        />
        
        <ReceiptFooter />
      </div>
    </div>
  );
}
