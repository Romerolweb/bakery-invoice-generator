// filepath: path to project/ romerolweb/bakery-invoice-generator/src/components/receipts/ReceiptActionButton.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EyeIcon, PrinterIcon } from 'lucide-react';

interface ReceiptActionButtonProps {
  receiptId: string;
}

export function ReceiptActionButton({ receiptId }: Readonly<ReceiptActionButtonProps>) {
  return (
    <div className="flex space-x-2">
      <Link href={`/receipt/${receiptId}`} passHref>
        <Button variant="outline" size="sm" asChild>
          <a className="flex items-center">
            <EyeIcon className="mr-2 h-4 w-4" />
            View
          </a>
        </Button>
      </Link>
      <Link href={`/receipt-view/${receiptId}`} passHref>
        <Button variant="outline" size="sm" asChild>
          <a className="flex items-center" target="_blank" rel="noopener noreferrer">
            <PrinterIcon className="mr-2 h-4 w-4" />
            Print
          </a>
        </Button>
      </Link>
    </div>
  );
}
