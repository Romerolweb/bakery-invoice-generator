import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiptItemsTable } from '@/components/receipts/components/ReceiptItemsTable';
import type { LineItem } from '@/lib/types';

const mockItems: LineItem[] = [
  {
    product_id: 'P1',
    description: 'Chocolate Cake',
    quantity: 2,
    unit_price: 15.00,
    line_total: 30.00,
    product_name: 'Chocolate Cake',
    GST_applicable: true,
  },
  {
    product_id: 'P2',
    description: 'Coffee Beans',
    quantity: 1,
    unit_price: 12.50,
    line_total: 12.50,
    product_name: 'Coffee Beans',
    GST_applicable: false,
  },
];

describe('ReceiptItemsTable', () => {
  it('should display items table with GST column', () => {
    render(<ReceiptItemsTable items={mockItems} showGST={true} />);
    
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('GST')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Unit Price')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
    expect(screen.getByText('Coffee Beans')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.getAllByText('$12.50')).toHaveLength(2); // Both unit price and total
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('should display items table without GST column', () => {
    render(<ReceiptItemsTable items={mockItems} showGST={false} />);
    
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.queryByText('GST')).not.toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Unit Price')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    
    expect(screen.queryByText('Yes')).not.toBeInTheDocument();
    expect(screen.queryByText('No')).not.toBeInTheDocument();
  });

  it('should handle empty items array', () => {
    render(<ReceiptItemsTable items={[]} showGST={true} />);
    
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('GST')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Unit Price')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('should use description fallback to product_name if description is empty', () => {
    const itemWithoutDescription: LineItem[] = [{
      product_id: 'P3',
      description: '',
      quantity: 1,
      unit_price: 10.00,
      line_total: 10.00,
      product_name: 'Fallback Product Name',
      GST_applicable: true,
    }];

    render(<ReceiptItemsTable items={itemWithoutDescription} showGST={true} />);
    
    expect(screen.getByText('Fallback Product Name')).toBeInTheDocument();
  });

  it('should have correct test id', () => {
    render(<ReceiptItemsTable items={mockItems} showGST={true} />);
    
    expect(screen.getByTestId('receipt-items-table')).toBeInTheDocument();
  });
});
