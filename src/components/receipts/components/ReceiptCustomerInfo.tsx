import type { Customer } from '@/lib/types';

interface ReceiptCustomerInfoProps {
  customer: Customer;
}

export function ReceiptCustomerInfo({ customer }: ReceiptCustomerInfoProps) {
  const getCustomerName = () => {
    if (customer.customer_type === 'business') {
      return customer.business_name || 'Business Customer';
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Individual Customer';
  };

  return (
    <div className="space-y-2" data-testid="receipt-customer-info">
      <h3 className="font-semibold text-gray-900 border-b pb-1">Bill To</h3>
      <div className="text-sm space-y-1">
        <p className="font-medium">{getCustomerName()}</p>
        {customer.email && <p>Email: {customer.email}</p>}
        {customer.phone && <p>Phone: {customer.phone}</p>}
        {customer.address && <p>{customer.address}</p>}
        {customer.abn && <p>ABN: {customer.abn}</p>}
      </div>
    </div>
  );
}
