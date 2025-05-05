// src/lib/types.ts

export interface SellerProfile {
  /**
   * The name of the seller (individual or business name).
   */

  name: string;
  business_address: string;
  ABN_or_ACN: string;
  contact_email: string;
  phone?: string; // Optional phone number
  logo_url?: string; // Optional logo URL
}

export interface Product {
  /**
   * Unique identifier for the product (UUID format).
   */
  id: string; // UUID
  /**
   * The name of the product.
   */
  name: string;
  /**
   * Optional description for the product.
   */
  description?: string; // Optional description
  /**
   * The price of a single unit of the product BEFORE GST.
   */
  unit_price: number;
  /**
   * Indicates if GST is applicable to this product.
   * If true, 10% GST will be added to the unit price if the overall
   * invoice has include_gst set to true.
   */
  GST_applicable: boolean;
}

export interface Customer {
  /**
   * Unique identifier for the customer (UUID format).
   */
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
  /**
   * The ID of the product being purchased.
   */
  product_id: string;
  /**
   * The description of the product for display purposes on the receipt.
   */
  description: string;
  /**
   * The quantity of the product purchased. Must be a positive integer.
   */
  quantity: number;
  /**
   * The unit price of the product *before* GST at the time of the sale.
   */
  unit_price: number; // Price *before* GST
  /**
   * The total for this line item *before* GST (quantity * unit_price).
   */
  line_total: number; // Total *before* GST (quantity * unit_price)
  /**
   * The name of the product for display purposes on the receipt.
   * Stored here to capture the name at the time of sale.
   */
  product_name: string; // For display on receipt/invoice
  /**
   * Indicates if GST was applicable to this specific product at the time of the sale.
   * Used for calculating GST amount per line item if needed, and confirming the
   * application of GST based on the product definition at sale time.
   */
  GST_applicable: boolean; // Was GST applicable to this product?
}

export interface Receipt {
  /**
   * Unique identifier for the receipt (UUID format).
   */
  receipt_id: string; // UUID
  customer_id: string;
  date_of_purchase: string; // ISO 8601 format string recommended, display as DD/MM/YYYY
  line_items: LineItem[];
  subtotal_excl_GST: number;
  GST_amount: number;
  total_inc_GST: number;
  is_tax_invoice: boolean;
  // Seller details snapshot at time of creation
  /**
   * A snapshot of the seller's profile details at the time the receipt was created.
   */
  seller_profile_snapshot: SellerProfile;
  // Customer details snapshot
  /**
   * A snapshot of relevant customer details at the time the receipt was created.
   * 'id' is duplicated, as it's redundant (already stored in customer_id). But it is left becaus it is easy to work with in the pdfGenerators.ts
   */
  customer_snapshot: Customer; // Store relevant customer details directly
}
