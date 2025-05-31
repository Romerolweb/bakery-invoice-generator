import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiptSellerInfo } from '@/components/receipts/components/ReceiptSellerInfo';
import type { SellerProfile } from '@/lib/types';

const mockSeller: SellerProfile = {
  name: 'Test Bakery',
  business_address: '123 Main Street',
  ABN_or_ACN: '12345678901',
  contact_email: 'test@bakery.com',
  phone: '555-0123',
};

describe('ReceiptSellerInfo', () => {
  it('should display all seller information', () => {
    render(<ReceiptSellerInfo seller={mockSeller} />);
    
    expect(screen.getByText('Seller Information')).toBeInTheDocument();
    expect(screen.getByText('Test Bakery')).toBeInTheDocument();
    expect(screen.getByText('123 Main Street')).toBeInTheDocument();
    expect(screen.getByText('Email: test@bakery.com')).toBeInTheDocument();
    expect(screen.getByText('Phone: 555-0123')).toBeInTheDocument();
    expect(screen.getByText('ABN: 12345678901')).toBeInTheDocument();
  });

  it('should handle missing optional fields', () => {
    const sellerWithoutOptional: SellerProfile = {
      name: 'Test Bakery',
      business_address: '123 Main Street',
      ABN_or_ACN: '',
      contact_email: 'test@bakery.com',
    };

    render(<ReceiptSellerInfo seller={sellerWithoutOptional} />);
    
    expect(screen.getByText('Test Bakery')).toBeInTheDocument();
    expect(screen.getByText('Email: test@bakery.com')).toBeInTheDocument();
    expect(screen.queryByText(/Phone:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ABN:/)).not.toBeInTheDocument();
  });

  it('should have correct test id', () => {
    render(<ReceiptSellerInfo seller={mockSeller} />);
    
    expect(screen.getByTestId('receipt-seller-info')).toBeInTheDocument();
  });
});
