import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ReceiptWebView } from '@/components/receipts/ReceiptWebView';
import type { Receipt } from '@/lib/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the child components
vi.mock('@/components/receipts/components/ReceiptContent', () => ({
  ReceiptContent: ({ receipt }: { receipt: Receipt }) => (
    <div data-testid="receipt-content">Receipt Content for {receipt.receipt_id}</div>
  ),
}));

vi.mock('@/components/receipts/components/PrintToolbar', () => ({
  PrintToolbar: ({ receiptId }: { receiptId: string }) => (
    <div data-testid="print-toolbar">Print Toolbar for {receiptId}</div>
  ),
}));

vi.mock('@/components/receipts/components/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
}));

vi.mock('@/components/receipts/components/ErrorMessage', () => ({
  ErrorMessage: ({ message }: { message: string }) => (
    <div data-testid="error-message">{message}</div>
  ),
}));

const mockReceipt: Receipt = {
  receipt_id: 'TEST-001',
  customer_id: 'CUST-001',
  date_of_purchase: '2024-01-01T00:00:00.000Z',
  line_items: [{
    product_id: 'P1',
    description: 'Test Product',
    quantity: 1,
    unit_price: 10.00,
    line_total: 10.00,
    product_name: 'Test Product',
    GST_applicable: true,
  }],
  subtotal_excl_GST: 10.00,
  GST_amount: 1.00,
  total_inc_GST: 11.00,
  is_tax_invoice: true,
  seller_profile_snapshot: {
    name: 'Test Bakery',
    business_address: '123 Test St',
    ABN_or_ACN: '123456789',
    contact_email: 'test@bakery.com',
  },
  customer_snapshot: {
    id: 'CUST-001',
    customer_type: 'individual',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
  },
};

describe('ReceiptWebView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock document.title
    Object.defineProperty(document, 'title', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show loading spinner initially', async () => {
    // Use a delayed promise to ensure loading state is visible
    let resolvePromise: (value: any) => void;
    const delayedPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(
      delayedPromise.then(() => ({
        json: () => Promise.resolve({ success: true, data: mockReceipt }),
      }))
    );

    render(<ReceiptWebView receiptId="TEST-001" />);
    
    // Should show loading spinner immediately
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    
    // Resolve the promise and wait for completion
    resolvePromise!({
      json: () => Promise.resolve({ success: true, data: mockReceipt }),
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('receipt-content')).toBeInTheDocument();
    });
  });

  it('should fetch and display receipt successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockReceipt }),
    });

    await act(async () => {
      render(<ReceiptWebView receiptId="TEST-001" />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-content')).toBeInTheDocument();
    });

    expect(screen.getByTestId('print-toolbar')).toBeInTheDocument();
    expect(screen.getByText('Receipt Content for TEST-001')).toBeInTheDocument();
    expect(screen.getByText('Print Toolbar for TEST-001')).toBeInTheDocument();
  });

  it('should call correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockReceipt }),
    });

    await act(async () => {
      render(<ReceiptWebView receiptId="TEST-001" />);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/receipts/TEST-001');
    });
  });

  it('should set document title when receipt loads', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockReceipt }),
    });

    await act(async () => {
      render(<ReceiptWebView receiptId="TEST-001" />);
    });

    await waitFor(() => {
      expect(document.title).toBe('Invoice TEST-001');
    });
  });

  it('should display error message when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Receipt not found' }),
    });

    await act(async () => {
      render(<ReceiptWebView receiptId="TEST-001" />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });

    expect(screen.getByText('Receipt not found')).toBeInTheDocument();
  });

  it('should display error message when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      render(<ReceiptWebView receiptId="TEST-001" />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('should display error when no data received', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: null }),
    });

    await act(async () => {
      render(<ReceiptWebView receiptId="TEST-001" />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });

    expect(screen.getByText('No receipt data received')).toBeInTheDocument();
  });
});
