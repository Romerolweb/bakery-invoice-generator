// src/lib/types.ts

export interface SellerProfile {
  name: string;
  business_address: string;
  ABN_or_ACN: string;
  contact_email: string;
  phone?: string; // Optional phone number
  logo_url?: string; // Optional logo URL
}

export interface Product {
  id: string; // UUID
  name: string;
  description?: string; // Optional description
  unit_price: number;
  GST_applicable: boolean;
}

export interface Customer {
  id: string; // UUID
  customer_type: 'individual' | 'business';
  first_name?: string; // Optional for business, required for individual (will be enforced by schema)
  last_name?: string; // Optional
  business_name?: string; // Optional for individual, required for business (will be enforced by schema)
  abn?: string; // Optional, typically for business type
  email?: string; // Optional
  phone?: string; // Optional
  address?: string; // Optional
}

export interface LineItem {
  product_id: string;
  quantity: number;
  unit_price: number; // Price *before* GST
  line_total: number; // Total *before* GST (quantity * unit_price)
  product_name: string; // For display on receipt/invoice
  GST_applicable: boolean; // Was GST applicable to this product?
}

export interface Receipt {
  receipt_id: string; // UUID
  customer_id: string;
  date_of_purchase: string; // ISO 8601 format string recommended, display as DD/MM/YYYY
  line_items: LineItem[];
  subtotal_excl_GST: number;
  GST_amount: number;
  total_inc_GST: number;
  is_tax_invoice: boolean;
  // Seller details snapshot at time of creation
  seller_profile_snapshot: SellerProfile;
  // Customer details snapshot
  customer_snapshot: Omit<Customer, 'id'>; // Store relevant customer details directly
}
