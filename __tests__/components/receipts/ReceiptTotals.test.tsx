import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiptTotals } from '@/components/receipts/components/ReceiptTotals';

describe('ReceiptTotals', () => {
  const defaultProps = {
    subtotal: 100.0,
    gstAmount: 10.0,
    total: 110.0,
    showGST: true,
  };

  it('renders subtotal, GST, and total correctly when showGST is true', () => {
    render(<ReceiptTotals {...defaultProps} />);

    expect(screen.getByText('Subtotal:')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();

    expect(screen.getByText('GST (10%):')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();

    expect(screen.getByText('Total:')).toBeInTheDocument();
    expect(screen.getByText('$110.00')).toBeInTheDocument();
  });

  it('hides GST when showGST is false', () => {
    render(<ReceiptTotals {...defaultProps} showGST={false} />);

    expect(screen.getByText('Subtotal:')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();

    expect(screen.queryByText('GST (10%):')).not.toBeInTheDocument();
    expect(screen.queryByText('$10.00')).not.toBeInTheDocument();

    expect(screen.getByText('Total:')).toBeInTheDocument();
    expect(screen.getByText('$110.00')).toBeInTheDocument();
  });

  it('formats values to 2 decimal places', () => {
    render(
      <ReceiptTotals
        subtotal={10.5}
        gstAmount={1.05}
        total={11.55}
        showGST={true}
      />
    );

    expect(screen.getByText('$10.50')).toBeInTheDocument();
    expect(screen.getByText('$1.05')).toBeInTheDocument();
    expect(screen.getByText('$11.55')).toBeInTheDocument();
  });

  it('handles zero values correctly', () => {
    render(
      <ReceiptTotals
        subtotal={0}
        gstAmount={0}
        total={0}
        showGST={true}
      />
    );

    expect(screen.getAllByText('$0.00')).toHaveLength(3);
  });

  it('handles null/undefined values by defaulting to 0.00', () => {
    // @ts-ignore - testing runtime behavior for null/undefined
    render(<ReceiptTotals subtotal={null} gstAmount={undefined} total={null} showGST={true} />);

    expect(screen.getAllByText('$0.00')).toHaveLength(3);
  });

  it('should have correct test id', () => {
    render(<ReceiptTotals {...defaultProps} />);

    expect(screen.getByTestId('receipt-totals')).toBeInTheDocument();
  });
});
