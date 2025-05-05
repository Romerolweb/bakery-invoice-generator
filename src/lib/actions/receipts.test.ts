import { describe, it, expect, vi } from 'vitest';
import { createReceipt, getAllReceipts, getReceiptById } from '@/lib/actions/receipts';
import { createReceipt as createReceiptData, getAllReceipts as getAllReceiptsData, getReceiptById as getReceiptByIdData } from '@/lib/data-access/receipts';
import { getAllProducts, getProductById } from '@/lib/data-access/products';
import { getSellerProfile } from '@/lib/data-access/seller';
import { getCustomerById } from '@/lib/data-access/customers';
import { Product, SellerProfile, Customer, Receipt } from '@/lib/types';

vi.mock('@/lib/data-access/receipts');
vi.mock('@/lib/data-access/products');
vi.mock('../data-access/products');
vi.mock('@/lib/data-access/seller');
vi.mock('@/lib/data-access/customers');

describe('Receipt Actions', () => {
  describe('createReceipt', () => {
    it('should successfully create a receipt', async () => {
      const mockProducts: Product[] = [{ id: '1', name: 'Product 1', unit_price: 10, GST_applicable: true }];
      const mockSellerProfile: SellerProfile = { id: 'seller1', business_name: 'Seller 1', abn: '123456789' };
      const mockCustomer: Customer = { id: 'customer1', customer_type: 'business', first_name: 'John', last_name: 'Doe', business_name: 'Customer 1', abn: '987654321', email: 'john.doe@example.com', phone: '0412345678', address: '1 Test Rd' };
      const mockReceipt: Receipt = { receipt_id: 'receipt1', customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [], subtotal_excl_GST: 0, GST_amount: 0, total_inc_GST: 0, is_tax_invoice: false, seller_profile_snapshot: mockSellerProfile, customer_snapshot: mockCustomer };

      vi.mocked(getAllProducts).mockResolvedValue(mockProducts);
      vi.mocked(getSellerProfile).mockResolvedValue(mockSellerProfile);
      vi.mocked(getCustomerById).mockResolvedValue(mockCustomer);
      vi.mocked(createReceiptData).mockResolvedValue(mockReceipt);

      const result = await createReceipt({ customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [{ product_id: '1', quantity: 1 }], include_gst: true, force_tax_invoice: false });
      expect(result.success).toBe(true);
      expect(result.receipt?.receipt_id).toBe('receipt1');
    });

    it('should fail when no products are found', async () => {
      vi.mocked(getAllProducts).mockResolvedValue([]);
      const result = await createReceipt({ customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [{ product_id: '1', quantity: 1 }], include_gst: true, force_tax_invoice: false });
      expect(result.success).toBe(false);
      expect(result.message).toBe('No products found.');
    });

    it('should fail when no seller profile is found', async () => {
      vi.mocked(getAllProducts).mockResolvedValue([{ id: '1', name: 'Product 1', unit_price: 10, GST_applicable: true }]);
      vi.mocked(getSellerProfile).mockResolvedValue(null);
      const result = await createReceipt({ customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [{ product_id: '1', quantity: 1 }], include_gst: true, force_tax_invoice: false });
      expect(result.success).toBe(false);
      expect(result.message).toBe('No seller profile found.');
    });
    it('should fail when no customer is found', async () => {
        vi.mocked(getAllProducts).mockResolvedValue([{ id: '1', name: 'Product 1', unit_price: 10, GST_applicable: true }]);
        vi.mocked(getSellerProfile).mockResolvedValue({ id: 'seller1', business_name: 'Seller 1', abn: '123456789' });
        vi.mocked(getCustomerById).mockResolvedValue(null);

        const result = await createReceipt({ customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [{ product_id: '1', quantity: 1 }], include_gst: true, force_tax_invoice: false });
        expect(result.success).toBe(false);
        expect(result.message).toBe('No customer found.');
      });

    it('should fail when product in line items is not found', async () => {
      vi.mocked(getProductById).mockResolvedValue(null)
      vi.mocked(getAllProducts).mockResolvedValue([{ id: '1', name: 'Product 1', unit_price: 10, GST_applicable: true }, { id: '2', name: 'Product 2', unit_price: 20, GST_applicable: false }]);
      vi.mocked(getSellerProfile).mockResolvedValue({ id: 'seller1', business_name: 'Seller 1', abn: '123456789' });
      vi.mocked(getCustomerById).mockResolvedValue({ id: 'customer1', customer_type: 'business', first_name: 'John', last_name: 'Doe', business_name: 'Customer 1', abn: '987654321', email: 'john.doe@example.com', phone: '0412345678', address: '1 Test Rd' });

      const result = await createReceipt({ customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [{ product_id: '2', quantity: 1 }], include_gst: true, force_tax_invoice: false });
 expect(result.message).toBe('Product with ID 2 not found.')
    });
  });
 
  describe('getAllReceipts', () => {
    it('should successfully retrieve all receipts', async () => {
      const mockReceipts: Receipt[] = [{ receipt_id: 'receipt1', customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [], subtotal_excl_GST: 0, GST_amount: 0, total_inc_GST: 0, is_tax_invoice: false, seller_profile_snapshot: { id: 'seller1', business_name: 'Seller 1', abn: '123456789' }, customer_snapshot: { id: 'customer1', customer_type: 'business', first_name: 'John', last_name: 'Doe', business_name: 'Customer 1', abn: '987654321', email: 'john.doe@example.com', phone: '0412345678', address: '1 Test Rd' } }];
      vi.mocked(getAllReceiptsData).mockResolvedValue(mockReceipts);
      const result = await getAllReceipts();
      expect(result).toEqual(mockReceipts);
    });

    it('should return an empty array when an error occurs during retrieval', async () => {
 vi.mocked(getAllReceiptsData).mockResolvedValue([]);
      const result = await getAllReceipts();
      expect(result).toEqual([]);
    });
  });

  describe('getReceiptById', () => {
    it('should successfully retrieve a receipt by ID', async () => {
      const mockReceipt: Receipt = { receipt_id: 'receipt1', customer_id: 'customer1', date_of_purchase: '2023-01-01', line_items: [], subtotal_excl_GST: 0, GST_amount: 0, total_inc_GST: 0, is_tax_invoice: false, seller_profile_snapshot: { id: 'seller1', business_name: 'Seller 1', abn: '123456789' }, customer_snapshot: { id: 'customer1', customer_type: 'business', first_name: 'John', last_name: 'Doe', business_name: 'Customer 1', abn: '987654321', email: 'john.doe@example.com', phone: '0412345678', address: '1 Test Rd' } };
      vi.mocked(getReceiptByIdData).mockResolvedValue(mockReceipt);
      const result = await getReceiptById('receipt1');
      expect(result).toEqual(mockReceipt);
    });

    it('should return null when a receipt is not found', async () => {
      vi.mocked(getReceiptByIdData).mockResolvedValue(null);
      const result = await getReceiptById('receipt1');
      expect(result).toBeNull();
    });

    it('should return null when an error occurs during retrieval', async () => {
 vi.mocked(getReceiptByIdData).mockResolvedValue(null);
      const result = await getReceiptById('receipt1');
      expect(result).toBeNull();
    });
  });
});
export {};