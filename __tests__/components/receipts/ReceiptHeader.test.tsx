import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiptHeader } from '@/components/receipts/components/ReceiptHeader';

describe('ReceiptHeader', () => {
  it('should display "TAX INVOICE" when isInvoice is true', () => {
    render(<ReceiptHeader isInvoice={true} />);
    
    expect(screen.getByText('TAX INVOICE')).toBeInTheDocument();
    expect(screen.getByText('Bakery Invoice Generator')).toBeInTheDocument();
  });

  it('should display "RECEIPT" when isInvoice is false', () => {
    render(<ReceiptHeader isInvoice={false} />);
    
    expect(screen.getByText('RECEIPT')).toBeInTheDocument();
    expect(screen.getByText('Bakery Invoice Generator')).toBeInTheDocument();
  });

  it('should have correct test id', () => {
    render(<ReceiptHeader isInvoice={true} />);
    
    expect(screen.getByTestId('receipt-header')).toBeInTheDocument();
  });
});
