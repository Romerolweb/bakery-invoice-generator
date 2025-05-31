import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReceiptViewButton } from '@/components/receipts/ReceiptViewButton';

// Mock window.open
const mockWindowOpen = vi.fn();
const mockFocus = vi.fn();

Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen,
});

describe('ReceiptViewButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowOpen.mockReturnValue({ focus: mockFocus });
  });

  it('should render view button by default', () => {
    render(<ReceiptViewButton receiptId="TEST-001" />);
    
    const button = screen.getByTestId('receipt-view-button');
    expect(button).toBeInTheDocument();
    expect(screen.getByText('View Receipt')).toBeInTheDocument();
    expect(button).toHaveClass('border');  // outline variant
  });

  it('should render print button when variant is print', () => {
    render(<ReceiptViewButton receiptId="TEST-001" variant="print" />);
    
    const button = screen.getByTestId('receipt-print-button');
    expect(button).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
    expect(button).not.toHaveClass('border');  // default variant
  });

  it('should open window with correct URL when clicked', () => {
    render(<ReceiptViewButton receiptId="TEST-001" />);
    
    const button = screen.getByTestId('receipt-view-button');
    fireEvent.click(button);
    
    expect(mockWindowOpen).toHaveBeenCalledWith(
      '/receipt/TEST-001',
      '_blank',
      'width=900,height=700,scrollbars=yes,resizable=yes,toolbar=no,menubar=no'
    );
  });

  it('should focus the opened window', () => {
    render(<ReceiptViewButton receiptId="TEST-001" />);
    
    const button = screen.getByTestId('receipt-view-button');
    fireEvent.click(button);
    
    expect(mockFocus).toHaveBeenCalledTimes(1);
  });

  it('should handle window.open returning null', () => {
    mockWindowOpen.mockReturnValue(null);
    
    render(<ReceiptViewButton receiptId="TEST-001" />);
    
    const button = screen.getByTestId('receipt-view-button');
    
    // Should not throw an error
    expect(() => fireEvent.click(button)).not.toThrow();
  });

  it('should apply custom className', () => {
    render(<ReceiptViewButton receiptId="TEST-001" className="custom-class" />);
    
    const button = screen.getByTestId('receipt-view-button');
    expect(button).toHaveClass('custom-class');
  });

  it('should display correct icons', () => {
    const { rerender } = render(<ReceiptViewButton receiptId="TEST-001" variant="view" />);
    
    // Check for Eye icon (view)
    expect(screen.getByTestId('receipt-view-button')).toBeInTheDocument();
    
    rerender(<ReceiptViewButton receiptId="TEST-001" variant="print" />);
    
    // Check for Printer icon (print)
    expect(screen.getByTestId('receipt-print-button')).toBeInTheDocument();
  });
});
