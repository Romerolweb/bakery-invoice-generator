import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

// Mock dependencies before importing the module under test
vi.mock('uuid', () => ({ v4: () => 'mock-uuid-123' }));
vi.mock('pdfkit'); // Mock the entire pdfkit library
vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
        ...actualFs.promises,
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn().mockResolvedValue(undefined),
        access: vi.fn().mockResolvedValue(undefined), // Assume file exists by default
        unlink: vi.fn().mockResolvedValue(undefined),
    },
    createWriteStream: vi.fn().mockReturnValue({
        on: vi.fn((event, cb) => {
            // Immediately call 'finish' callback for testing purposes
            if (event === 'finish') {
                 setTimeout(cb, 0); // Simulate async finish
            }
             return this; // Allow chaining
        }),
        end: vi.fn(),
        writableEnded: false,
    }),
  };
});
vi.mock('@/lib/actions/customers', () => ({
    getCustomerById: vi.fn(),
}));
vi.mock('@/lib/actions/products', () => ({
    getProductById: vi.fn(),
}));
vi.mock('@/lib/actions/seller', () => ({
    getSellerProfile: vi.fn(),
}));

// Now import the module under test
import { createReceipt, generateReceiptPdf, readReceipts, writeReceipts } from '@/lib/actions/receipts';
import { getCustomerById } from '@/lib/actions/customers';
import { getProductById } from '@/lib/actions/products';
import { getSellerProfile } from '@/lib/actions/seller';
import type { Customer, Product, SellerProfile, Receipt, LineItem } from '@/lib/types';
import { parseISO } from 'date-fns';

// --- Mock Data ---
const mockSeller: SellerProfile = {
    name: 'Test Bakery',
    business_address: '1 Test St, Testville, TS 1234',
    ABN_or_ACN: '11 222 333 444',
    contact_email: 'test@bakery.com',
    phone: '0123456789',
    logo_url: '',
};

const mockCustomerIndividual: Customer = {
    id: 'cust-ind-1',
    customer_type: 'individual',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    phone: '9876543210',
    address: '5 Sample Ave, Samplton, SP 5678',
};

const mockCustomerBusiness: Customer = {
    id: 'cust-biz-1',
    customer_type: 'business',
    business_name: 'Doe Corp',
    abn: '55 666 777 888',
    first_name: 'John', // Contact
    last_name: 'Smith', // Contact
    email: 'contact@doecorp.com',
    phone: '1122334455',
    address: '10 Business Rd, Biztown, BZ 9101',
};


const mockProduct1: Product = {
    id: 'prod-1',
    name: 'Croissant',
    description: 'Flaky',
    unit_price: 3.50,
    GST_applicable: true,
};

const mockProduct2: Product = {
    id: 'prod-2',
    name: 'Sourdough Loaf',
    unit_price: 7.00,
    GST_applicable: false,
};

const mockProduct3_GST: Product = {
    id: 'prod-3',
    name: 'Coffee',
    unit_price: 4.50,
    GST_applicable: true,
};


// --- Test Setup ---
describe('Receipt Actions', () => {
    let mockDocInstance: any;

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();

        // Setup mock PDFDocument instance
        mockDocInstance = {
            pipe: vi.fn().mockReturnThis(),
            font: vi.fn().mockReturnThis(),
            fontSize: vi.fn().mockReturnThis(),
            text: vi.fn().mockReturnThis(),
            moveDown: vi.fn().mockReturnThis(),
            moveTo: vi.fn().mockReturnThis(),
            lineTo: vi.fn().mockReturnThis(),
            stroke: vi.fn().mockReturnThis(),
            end: vi.fn(),
            on: vi.fn().mockReturnThis(),
            writableEnded: false,
        };
        (PDFDocument as any).mockImplementation(() => mockDocInstance);

        // Mock file system reads/writes
        (fs.readFile as vi.Mock).mockResolvedValue('[]'); // Default: empty array
        (fs.writeFile as vi.Mock).mockResolvedValue(undefined);
        (fs.mkdir as vi.Mock).mockResolvedValue(undefined);
        (fs.access as vi.Mock).mockResolvedValue(undefined); // Assume PDF exists if checked


        // Mock data fetching actions
        (getSellerProfile as vi.Mock).mockResolvedValue(mockSeller);
        (getCustomerById as vi.Mock).mockImplementation(async (id) => {
            if (id === mockCustomerIndividual.id) return mockCustomerIndividual;
            if (id === mockCustomerBusiness.id) return mockCustomerBusiness;
            return null;
        });
         (getProductById as vi.Mock).mockImplementation(async (id) => {
            if (id === mockProduct1.id) return mockProduct1;
            if (id === mockProduct2.id) return mockProduct2;
            if (id === mockProduct3_GST.id) return mockProduct3_GST;
            return null;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // --- createReceipt Tests ---
    describe('createReceipt', () => {
        it('should create a basic invoice with one item (no GST)', async () => {
            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-15',
                line_items: [{ product_id: mockProduct2.id, quantity: 2 }],
                include_gst: false,
            };

            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.pdfPath).toBeDefined();
            expect(result.receipt?.receipt_id).toBe('mock-uuid-123');
            expect(result.receipt?.customer_id).toBe(mockCustomerIndividual.id);
            expect(result.receipt?.line_items).toHaveLength(1);
            expect(result.receipt?.line_items[0].product_id).toBe(mockProduct2.id);
            expect(result.receipt?.line_items[0].quantity).toBe(2);
            expect(result.receipt?.line_items[0].unit_price).toBe(7.00);
            expect(result.receipt?.line_items[0].line_total).toBe(14.00);
            expect(result.receipt?.subtotal_excl_GST).toBe(14.00);
            expect(result.receipt?.GST_amount).toBe(0);
            expect(result.receipt?.total_inc_GST).toBe(14.00);
            expect(result.receipt?.is_tax_invoice).toBe(false); // Below threshold, GST not included
            expect(result.receipt?.customer_snapshot.first_name).toBe('Jane');
            expect(result.receipt?.seller_profile_snapshot.name).toBe('Test Bakery');

            // Verify writeReceipts was called with the new receipt added
            expect(fs.writeFile).toHaveBeenCalledTimes(1); // For receipts.json
            const writtenData = JSON.parse((fs.writeFile as vi.Mock).mock.calls[0][1]);
            expect(writtenData).toHaveLength(1);
            expect(writtenData[0].receipt_id).toBe('mock-uuid-123');

            // Verify PDF generation was called
            expect(PDFDocument).toHaveBeenCalledTimes(1);
             expect(mockDocInstance.text).toHaveBeenCalledWith('INVOICE', expect.anything()); // Check title

        });

         it('should create an invoice with multiple items including GST', async () => {
            const input = {
                customer_id: mockCustomerBusiness.id,
                date_of_purchase: '2024-01-16',
                line_items: [
                    { product_id: mockProduct1.id, quantity: 10 }, // 3.50 * 10 = 35.00 (GST applicable)
                    { product_id: mockProduct2.id, quantity: 5 },  // 7.00 * 5 = 35.00 (No GST)
                ],
                include_gst: true,
            };

            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.line_items).toHaveLength(2);
            expect(result.receipt?.subtotal_excl_GST).toBe(70.00); // 35 + 35
            expect(result.receipt?.GST_amount).toBe(3.50); // 10% of 35.00 (only product 1)
            expect(result.receipt?.total_inc_GST).toBe(73.50); // 70 + 3.50
             expect(result.receipt?.is_tax_invoice).toBe(false); // GST included, but total < $82.50
            expect(result.receipt?.customer_snapshot.business_name).toBe('Doe Corp');


             expect(fs.writeFile).toHaveBeenCalledTimes(1);
              expect(PDFDocument).toHaveBeenCalledTimes(1);
               expect(mockDocInstance.text).toHaveBeenCalledWith('INVOICE', expect.anything()); // Check title
        });

        it('should create a tax invoice if total >= $82.50 and GST included', async () => {
            const input = {
                customer_id: mockCustomerBusiness.id,
                date_of_purchase: '2024-01-17',
                line_items: [
                    { product_id: mockProduct1.id, quantity: 20 }, // 3.50 * 20 = 70.00 (GST applicable) -> GST = 7.00
                    { product_id: mockProduct2.id, quantity: 3 },  // 7.00 * 3 = 21.00 (No GST)
                ],
                include_gst: true,
            };

            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.subtotal_excl_GST).toBe(91.00); // 70 + 21
            expect(result.receipt?.GST_amount).toBe(7.00); // 10% of 70.00
            expect(result.receipt?.total_inc_GST).toBe(98.00); // 91 + 7
            expect(result.receipt?.is_tax_invoice).toBe(true); // Total >= 82.50 and GST included

             expect(fs.writeFile).toHaveBeenCalledTimes(1);
              expect(PDFDocument).toHaveBeenCalledTimes(1);
               expect(mockDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', expect.anything()); // Check title
        });

        it('should create a tax invoice if forced, even if below threshold', async () => {
            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-18',
                line_items: [{ product_id: mockProduct1.id, quantity: 1 }], // 3.50 (GST applicable) -> GST = 0.35, Total = 3.85
                include_gst: true,
                force_tax_invoice: true, // Force it
            };

            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.total_inc_GST).toBe(3.85);
            expect(result.receipt?.is_tax_invoice).toBe(true); // Forced

             expect(fs.writeFile).toHaveBeenCalledTimes(1);
              expect(PDFDocument).toHaveBeenCalledTimes(1);
               expect(mockDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', expect.anything()); // Check title
        });

        it('should fail if customer not found', async () => {
             (getCustomerById as vi.Mock).mockResolvedValue(null);
            const input = {
                customer_id: 'non-existent-cust',
                date_of_purchase: '2024-01-15',
                line_items: [{ product_id: mockProduct2.id, quantity: 2 }],
                include_gst: false,
            };
            const result = await createReceipt(input);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Customer with ID non-existent-cust not found');
            expect(fs.writeFile).not.toHaveBeenCalled();
             expect(PDFDocument).not.toHaveBeenCalled();
        });

        it('should fail if a product not found', async () => {
            (getProductById as vi.Mock).mockImplementation(async (id) => {
                 if (id === mockProduct1.id) return mockProduct1;
                 return null; // Simulate prod-x not found
            });
            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-15',
                line_items: [
                    { product_id: mockProduct1.id, quantity: 1 },
                    { product_id: 'prod-x', quantity: 1 }
                ],
                include_gst: true,
            };
            const result = await createReceipt(input);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Product(s) not found: prod-x');
             expect(fs.writeFile).not.toHaveBeenCalled();
            expect(PDFDocument).not.toHaveBeenCalled();
        });

        it('should fail if line items are empty', async () => {
             const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-15',
                line_items: [],
                include_gst: false,
            };
             const result = await createReceipt(input);
            expect(result.success).toBe(false);
             expect(result.message).toContain('at least one line item are required');
             expect(fs.writeFile).not.toHaveBeenCalled();
             expect(PDFDocument).not.toHaveBeenCalled();
        });

         it('should fail if PDF generation fails', async () => {
            // Simulate error during PDF generation (e.g., stream error)
            const streamMock = {
                on: vi.fn((event, cb) => {
                    if (event === 'error') {
                        // Simulate error *after* 'finish' would normally be called
                         setTimeout(() => cb(new Error('Fake PDF stream error')), 10);
                    } else if (event === 'finish') {
                        // Don't call finish immediately
                    }
                     return this; // Allow chaining
                }),
                end: vi.fn(),
                 writableEnded: false,
            };
            (fs.createWriteStream as vi.Mock).mockReturnValue(streamMock);


            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-15',
                line_items: [{ product_id: mockProduct2.id, quantity: 2 }],
                include_gst: false,
            };

            const result = await createReceipt(input);

            expect(result.success).toBe(false);
            expect(result.message).toMatch(/Failed to generate PDF: PDF stream error: Fake PDF stream error/);
            expect(fs.writeFile).not.toHaveBeenCalled(); // Should not save receipt if PDF fails
             expect(fs.unlink).toHaveBeenCalled(); // Should try to delete the failed PDF
        });
    });

    // --- generateReceiptPdf Tests (testing the isolated function) ---
    describe('generateReceiptPdf', () => {
         it('should call PDF generation functions with correct data', async () => {
            const lineItems: LineItem[] = [
                 { product_id: mockProduct1.id, quantity: 2, unit_price: 3.50, line_total: 7.00, product_name: 'Croissant', GST_applicable: true },
                 { product_id: mockProduct2.id, quantity: 1, unit_price: 7.00, line_total: 7.00, product_name: 'Sourdough Loaf', GST_applicable: false },
            ];
             const testReceipt: Receipt = {
                 receipt_id: 'pdf-test-1',
                 customer_id: mockCustomerBusiness.id,
                 date_of_purchase: '2024-02-01T00:00:00Z',
                 line_items: lineItems,
                 subtotal_excl_GST: 14.00,
                 GST_amount: 0.70, // 10% of 7.00
                 total_inc_GST: 14.70,
                 is_tax_invoice: false,
                 seller_profile_snapshot: mockSeller,
                 customer_snapshot: mockCustomerBusiness,
             };

            const result = await generateReceiptPdf(testReceipt);

             expect(result.success).toBe(true);
             expect(result.filePath).toBeDefined();
             expect(fs.createWriteStream).toHaveBeenCalledWith(expect.stringContaining('pdf-test-1.pdf'));
             expect(PDFDocument).toHaveBeenCalledTimes(1);

            // Check if sections were called (basic check, detailed content requires more complex mocking/spying)
            expect(mockDocInstance.text).toHaveBeenCalledWith('INVOICE', { align: 'center' }); // Header
            expect(mockDocInstance.text).toHaveBeenCalledWith('From:', { underline: true }); // Seller Info Start
            expect(mockDocInstance.text).toHaveBeenCalledWith(mockSeller.name);
             expect(mockDocInstance.text).toHaveBeenCalledWith('To:', { underline: true }); // Customer Info Start
            expect(mockDocInstance.text).toHaveBeenCalledWith(mockCustomerBusiness.business_name);
            expect(mockDocInstance.text).toHaveBeenCalledWith('Invoice ID: pdf-test-1'); // Details
             expect(mockDocInstance.text).toHaveBeenCalledWith('Item', expect.anything()); // Table Header
             expect(mockDocInstance.text).toHaveBeenCalledWith('Croissant', expect.anything()); // Line Item 1 Name
             expect(mockDocInstance.text).toHaveBeenCalledWith('Sourdough Loaf', expect.anything()); // Line Item 2 Name
            expect(mockDocInstance.text).toHaveBeenCalledWith(`$${testReceipt.subtotal_excl_GST.toFixed(2)}`, expect.anything()); // Totals
            expect(mockDocInstance.end).toHaveBeenCalledTimes(1);
         });

          it('should handle stream errors during PDF generation', async () => {
             const streamMock = {
                on: vi.fn((event, cb) => {
                    if (event === 'error') {
                         cb(new Error('Stream write failed'));
                    }
                    return this;
                }),
                end: vi.fn(),
                writableEnded: false, // Add this property
            };
             (fs.createWriteStream as vi.Mock).mockReturnValue(streamMock);

             const testReceipt: Receipt = {
                 receipt_id: 'pdf-fail-1',
                 customer_id: mockCustomerIndividual.id,
                 date_of_purchase: '2024-02-02T00:00:00Z',
                 line_items: [{ product_id: mockProduct1.id, quantity: 1, unit_price: 3.50, line_total: 3.50, product_name: 'Croissant', GST_applicable: true }],
                 subtotal_excl_GST: 3.50,
                 GST_amount: 0.35,
                 total_inc_GST: 3.85,
                 is_tax_invoice: false,
                 seller_profile_snapshot: mockSeller,
                 customer_snapshot: mockCustomerIndividual,
             };

            const result = await generateReceiptPdf(testReceipt);

             expect(result.success).toBe(false);
             expect(result.message).toMatch(/Failed to generate PDF: PDF stream error: Stream write failed/);
             expect(result.filePath).toBeUndefined();
             expect(mockDocInstance.end).toHaveBeenCalled(); // Should still attempt to end doc
             expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('pdf-fail-1.pdf')); // Should try to delete failed PDF
         });
    });

    // --- readReceipts / writeReceipts Tests (Simple examples) ---
     describe('readReceipts / writeReceipts', () => {
        it('readReceipts should return parsed data or empty array', async () => {
            (fs.readFile as vi.Mock).mockResolvedValue(JSON.stringify([{ id: 1 }, { id: 2 }]));
            let data = await readReceipts();
            expect(data).toEqual([{ id: 1 }, { id: 2 }]);

            (fs.readFile as vi.Mock).mockRejectedValue({ code: 'ENOENT' }); // Simulate file not found
            data = await readReceipts();
             expect(data).toEqual([]);
        });

         it('writeReceipts should call fs.writeFile with stringified data', async () => {
            const receiptsToWrite = [{ receipt_id: 'r1' }, { receipt_id: 'r2' }];
            await writeReceipts(receiptsToWrite as any); // Cast for test simplicity
             expect(fs.writeFile).toHaveBeenCalledWith(
                expect.any(String), // path
                JSON.stringify(receiptsToWrite, null, 2), // stringified data
                'utf-8'
            );
        });
    });

});
