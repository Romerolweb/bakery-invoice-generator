import type { SellerProfile } from '@/lib/types';

interface ReceiptSellerInfoProps {
  seller: SellerProfile;
}

export function ReceiptSellerInfo({ seller }: ReceiptSellerInfoProps) {
  return (
    <div className="space-y-2" data-testid="receipt-seller-info">
      <h3 className="font-semibold text-gray-900 border-b pb-1">Seller Information</h3>
      <div className="text-sm space-y-1">
        <p className="font-medium">{seller.name}</p>
        <p>{seller.business_address}</p>
        <p>Email: {seller.contact_email}</p>
        {seller.phone && <p>Phone: {seller.phone}</p>}
        {seller.ABN_or_ACN && <p>ABN: {seller.ABN_or_ACN}</p>}
      </div>
    </div>
  );
}
