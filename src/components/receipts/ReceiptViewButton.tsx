'use client';

import { Button } from '@/components/ui/button';
import { Eye, Printer } from 'lucide-react';

interface ReceiptViewButtonProps {
  receiptId: string;
  variant?: 'view' | 'print';
  className?: string;
}

export function ReceiptViewButton({ 
  receiptId,
  variant = 'view',
  className = '' 
}: Readonly<ReceiptViewButtonProps>) {
  const handleOpenReceipt = () => {
    const url = `/receipt/${receiptId}`;
    const features = 'width=900,height=700,scrollbars=yes,resizable=yes,toolbar=no,menubar=no';
    const newWindow = window.open(url, '_blank', features);
    
    if (newWindow) {
      newWindow.focus();
    }
  };

  return (
    <Button 
      onClick={handleOpenReceipt}
      variant={variant === 'view' ? 'outline' : 'default'}
      size="sm"
      className={`flex items-center gap-2 ${className}`}
      data-testid={`receipt-${variant}-button`}
    >
      {variant === 'view' ? (
        <>
          <Eye size={16} />
          View Receipt
        </>
      ) : (
        <>
          <Printer size={16} />
          Print
        </>
      )}
    </Button>
  );
}
