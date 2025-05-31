'use client';

import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';

interface PrintToolbarProps {
  receiptId: string;
}

export function PrintToolbar({ receiptId }: PrintToolbarProps) {
  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    window.close();
  };

  return (
    <div className="print:hidden sticky top-0 z-50 bg-gray-100 border-b p-4 shadow-sm">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <h1 className="text-lg font-semibold">Invoice {receiptId}</h1>
        
        <div className="flex gap-2">
          <Button 
            onClick={handlePrint} 
            className="flex items-center gap-2"
            data-testid="print-button"
          >
            <Printer size={16} />
            Print
          </Button>
          
          <Button 
            onClick={handleClose} 
            variant="ghost"
            className="flex items-center gap-2"
            data-testid="close-button"
          >
            <X size={16} />
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
