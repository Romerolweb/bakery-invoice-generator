'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt } from "@/lib/types"; // Assuming you have a Receipt type
import { ReceiptActionButton } from "./ReceiptActionButton";
import { formatDate } from "@/lib/utils"; // Ensure this import is present and correct

interface ReceiptsTableProps {
  receipts: Receipt[];
  isLoading?: boolean;
}

export function ReceiptsTable({ receipts, isLoading }: Readonly<ReceiptsTableProps>) {
  if (isLoading) {
    return <div>Loading receipts...</div>; // Or a skeleton loader
  }

  if (!receipts || receipts.length === 0) {
    return <div>No receipts found.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt #</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {receipts.map((receipt) => (
          <TableRow key={receipt.receipt_id}> {/* Use receipt_id for key */}
            <TableCell className="font-medium">{receipt.receipt_id.slice(0, 8)}...</TableCell> {/* Use receipt_id */}
            {/* customer_name is part of customer_snapshot */}
            <TableCell>{receipt.customer_snapshot?.first_name ?? receipt.customer_snapshot?.business_name ?? 'N/A'}</TableCell>
            <TableCell>{formatDate(receipt.date_of_purchase)}</TableCell> {/* Use date_of_purchase */}
            <TableCell>${receipt.total_inc_GST.toFixed(2)}</TableCell> {/* Use total_inc_GST */}
            <TableCell>
              {/* Assuming status is derived or needs a different logic, for now, let's use is_tax_invoice */}
              <Badge variant={receipt.is_tax_invoice ? 'default' : 'secondary'}>
                {receipt.is_tax_invoice ? 'Tax Invoice' : 'Receipt'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <ReceiptActionButton receiptId={receipt.receipt_id} /> {/* Use receipt_id */}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
