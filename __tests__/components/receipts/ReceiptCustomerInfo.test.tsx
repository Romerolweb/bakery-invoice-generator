import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiptCustomerInfo } from '@/components/receipts/components/ReceiptCustomerInfo';
import type { Customer } from '@/lib/types';

const mockIndividualCustomer: Customer = {
  id: 'CUST-001',
  customer_type: 'individual',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  phone: '555-0123',
  address: '456 Oak Street',
};

const mockBusinessCustomer: Customer = {
  id: 'CUST-002',
  customer_type: 'business',
  business_name: 'ABC Corporation',
  email: 'contact@abc.com',
  abn: '98765432109',
};

describe('ReceiptCustomerInfo', () => {
  it('should display individual customer information', () => {
    render(<ReceiptCustomerInfo customer={mockIndividualCustomer} />);
    
    expect(screen.getByText('Bill To')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Email: john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Phone: 555-0123')).toBeInTheDocument();
    expect(screen.getByText('456 Oak Street')).toBeInTheDocument();
  });

  it('should display business customer information', () => {
    render(<ReceiptCustomerInfo customer={mockBusinessCustomer} />);
    
    expect(screen.getByText('Bill To')).toBeInTheDocument();
    expect(screen.getByText('ABC Corporation')).toBeInTheDocument();
    expect(screen.getByText('Email: contact@abc.com')).toBeInTheDocument();
    expect(screen.getByText('ABN: 98765432109')).toBeInTheDocument();
  });

  it('should handle incomplete individual customer name', () => {
    const incompleteCustomer: Customer = {
      id: 'CUST-003',
      customer_type: 'individual',
      first_name: 'John',
      email: 'john@example.com',
    };

    render(<ReceiptCustomerInfo customer={incompleteCustomer} />);
    
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('should show fallback name for incomplete data', () => {
    const emptyCustomer: Customer = {
      id: 'CUST-004',
      customer_type: 'individual',
    };

    render(<ReceiptCustomerInfo customer={emptyCustomer} />);
    
    expect(screen.getByText('Individual Customer')).toBeInTheDocument();
  });

  it('should show fallback name for business without name', () => {
    const businessWithoutName: Customer = {
      id: 'CUST-005',
      customer_type: 'business',
      email: 'contact@business.com',
    };

    render(<ReceiptCustomerInfo customer={businessWithoutName} />);
    
    expect(screen.getByText('Business Customer')).toBeInTheDocument();
  });

  it('should have correct test id', () => {
    render(<ReceiptCustomerInfo customer={mockIndividualCustomer} />);
    
    expect(screen.getByTestId('receipt-customer-info')).toBeInTheDocument();
  });
});
