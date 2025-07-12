import type { LineItem } from '@/lib/types';

interface ReceiptItemsTableProps {
  items: LineItem[];
  showGST: boolean;
}

export function ReceiptItemsTable({ items, showGST }: ReceiptItemsTableProps) {
  return (
    <div className="overflow-x-auto" data-testid="receipt-items-table">
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-300 px-4 py-2 text-left">Description</th>
            {showGST && <th className="border border-gray-300 px-4 py-2 text-center">GST</th>}
            <th className="border border-gray-300 px-4 py-2 text-center">Qty</th>
            <th className="border border-gray-300 px-4 py-2 text-right">Unit Price</th>
            <th className="border border-gray-300 px-4 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="border border-gray-300 px-4 py-2">
                {item.description || item.product_name}
              </td>
              {showGST && (
                <td className="border border-gray-300 px-4 py-2 text-center">
                  {item.GST_applicable ? 'Yes' : 'No'}
                </td>
              )}
              <td className="border border-gray-300 px-4 py-2 text-center">
                {item.quantity}
              </td>
              <td className="border border-gray-300 px-4 py-2 text-right">
                ${item.unit_price.toFixed(2)}
              </td>
              <td className="border border-gray-300 px-4 py-2 text-right">
                ${item.line_total.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
