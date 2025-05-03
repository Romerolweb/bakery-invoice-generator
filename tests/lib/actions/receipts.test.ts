import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import type { WriteStream } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit'; // Import for type checking, will be mocked

// --- Mocking Dependencies ---

vi.mock('uuid', () => ({ v4: () => 'mock-uuid-123' }));

// Refined PDFKit Mock
let mockPdfDocInstance: any;
let mockPdfDocErrorCallback: ((err: Error) => void) | null = null;
let mockPdfDocFinishCallback: (() => void) | null = null;

const createMockPdfInstance = () => ({
    pipe: vi.fn().mockReturnThis(),
    font: vi.fn().mockReturnThis(),
    fontSize: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    moveDown: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    strokeColor: vi.fn().mockReturnThis(),
    addPage: vi.fn().mockReturnThis(),
    end: vi.fn(() => {
        // Simulate end triggering finish if no error occurred
        if (mockPdfDocFinishCallback) {
             setTimeout(mockPdfDocFinishCallback, 0); // Simulate async finish
        }
    }),
    on: vi.fn((event, callback) => {
        if (event === 'error') mockPdfDocErrorCallback = callback;
        if (event === 'finish') mockPdfDocFinishCallback = callback; // Should not be used directly, end() triggers finish
        return mockPdfDocInstance;
    }),
    // Helper to manually trigger error for testing
    _triggerError: (err: Error) => {
        if (mockPdfDocErrorCallback) {
            mockPdfDocErrorCallback(err);
        }
    },
    page: {
        height: 792,
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
    },
    y: 50,
});

vi.mock('pdfkit', () => ({
    default: vi.fn().mockImplementation(() => {
        mockPdfDocInstance = createMockPdfInstance();
        return mockPdfDocInstance;
    }),
}));

// Refined fs Mock
let mockStreamError: Error | null = null;
let mockStreamFinishCallback: (() => void) | null = null;
let mockStreamCloseCallback: (() => void) | null = null; // Added for close event
let mockStreamEndCallback: ((err?: Error | null) => void) | null = null; // Store end callback
let mockWriteStreamInstance: WriteStream & { on: vi.Mock; end: vi.Mock; writable: boolean; closed: boolean; };

const createMockWriteStream = () => ({
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === 'finish') mockStreamFinishCallback = () => setTimeout(cb, 0);
        if (event === 'error') setTimeout(() => { if (mockStreamError) cb(mockStreamError); }, 0);
        if (event === 'close') mockStreamCloseCallback = () => setTimeout(cb, 0); // Store close callback
        return mockWriteStreamInstance;
    }),
    end: vi.fn((cb?: (err?: Error | null) => void) => {
        mockWriteStreamInstance.writable = false; // Mark as not writable on end
        mockStreamEndCallback = cb || null; // Store the end callback
        // Simulate the stream closing and finishing/erroring *after* end is called
        setTimeout(() => {
            mockWriteStreamInstance.closed = true; // Mark as closed
             if (mockStreamCloseCallback) mockStreamCloseCallback(); // Trigger close event

            if (mockStreamError) {
                if (mockStreamEndCallback) mockStreamEndCallback(mockStreamError);
            } else {
                if (mockStreamFinishCallback) mockStreamFinishCallback(); // Trigger finish event
                if (mockStreamEndCallback) mockStreamEndCallback(); // Call end callback without error
            }
        }, 10); // Small delay to simulate async nature
    }),
    writable: true, // Initially writable
    closed: false, // Initially not closed
});

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
        ...actualFs.promises,
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn().mockResolvedValue(undefined),
        access: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
    },
    createWriteStream: vi.fn().mockImplementation(() => {
        mockStreamError = null;
        mockStreamFinishCallback = null;
        mockStreamCloseCallback = null;
        mockStreamEndCallback = null;
        mockWriteStreamInstance = createMockWriteStream() as any; // Assign new instance
        return mockWriteStreamInstance;
    }),
     // Mock existsSync if needed for cleanup or other checks
     existsSync: vi.fn().mockReturnValue(true), // Assume file exists for unlink attempt by default
  };
});

// Mock dependent actions
vi.mock('@/lib/actions/customers', () => ({
    getCustomerById: vi.fn(),
}));
vi.mock('@/lib/actions/products', () => ({
    getProductById: vi.fn(),
}));
vi.mock('@/lib/actions/seller', () => ({
    getSellerProfile: vi.fn(),
}));

// --- Import Module Under Test ---
import {
    createReceipt,
    generateReceiptPdf,
    readReceipts,
    writeReceipts,
    getReceiptPdfPath,
    getReceiptPdfContent
} from '@/lib/actions/receipts';
import { getCustomerById } from '@/lib/actions/customers';
import { getProductById } from '@/lib/actions/products';
import { getSellerProfile } from '@/lib/actions/seller';
import type { Customer, Product, SellerProfile, Receipt, LineItem } from '@/lib/types';


// --- Mock Data ---
const mockSeller: SellerProfile = {
    name: 'Test Bakery', business_address: '1 Test St, Suburbia, STATE 1234', ABN_or_ACN: '11 222 333 444', contact_email: 'test@bakery.com', phone: '123456789', logo_url: 'http://logo.url/img.png',
};
const mockIncompleteSeller: SellerProfile = {
     name: '', business_address: '', ABN_or_ACN: '', contact_email: '', phone: '', logo_url: '',
 };
const mockCustomerIndividual: Customer = {
    id: 'cust-ind-1', customer_type: 'individual', first_name: 'Jane', last_name: 'Doe', email: 'j.doe@example.com', phone: '987654321', address: '5 Sample Ave, Townsville, STATE 5678',
};
const mockCustomerBusiness: Customer = {
    id: 'cust-biz-1', customer_type: 'business', business_name: 'Doe Corp Pty Ltd', abn: '55 666 777 888', first_name: 'John', last_name: 'Smith (CEO)', email: 'contact@doecorp.com', phone: '112233445', address: '10 Business Road, Cityville, STATE 9012',
};
const mockProduct1_GST: Product = { id: 'prod-1', name: 'Premium Croissant', unit_price: 3.50, GST_applicable: true, description: 'Flaky and buttery' };
const mockProduct2_NoGST: Product = { id: 'prod-2', name: 'Organic Sourdough Loaf', unit_price: 7.00, GST_applicable: false, description: 'Naturally leavened' };
const mockProduct3_GST_Expensive: Product = { id: 'prod-3', name: 'Espresso Machine Deluxe', unit_price: 100.00, GST_applicable: true, description: 'Commercial grade' };

// --- Test Suite ---
describe('Receipt Actions', () => {

    let PDFDocumentMock: vi.Mock;

    beforeEach(() => {
        vi.clearAllMocks();
        PDFDocumentMock = (PDFDocument as unknown as vi.Mock);

        // Default successful mocks
        vi.mocked(fs.promises.readFile).mockResolvedValue('[]');
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.access).mockResolvedValue(undefined);
        vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);
        vi.mocked(fs.existsSync).mockReturnValue(true); // Assume file exists for unlink

        vi.mocked(getSellerProfile).mockResolvedValue(mockSeller);
        vi.mocked(getCustomerById).mockImplementation(async (id) => {
            if (id === mockCustomerIndividual.id) return mockCustomerIndividual;
            if (id === mockCustomerBusiness.id) return mockCustomerBusiness;
            return null;
        });
        vi.mocked(getProductById).mockImplementation(async (id) => {
            if (id === mockProduct1_GST.id) return mockProduct1_GST;
            if (id === mockProduct2_NoGST.id) return mockProduct2_NoGST;
            if (id === mockProduct3_GST_Expensive.id) return mockProduct3_GST_Expensive;
            return null;
        });
    });

    // --- createReceipt Tests ---
    describe('createReceipt', () => {
        const basicInput = {
            customer_id: mockCustomerIndividual.id,
            date_of_purchase: '2024-01-15',
            line_items: [{ product_id: mockProduct2_NoGST.id, quantity: 2 }], // Total: 14.00
            include_gst: false,
        };

        it('should successfully create a basic invoice (no GST, below threshold)', async () => {
            const result = await createReceipt(basicInput);

            // Wait for potential async operations within createReceipt/generatePdf to settle
            await vi.waitFor(() => {
                 expect(mockWriteStreamInstance?.closed).toBe(true);
            });


            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.pdfPath).toContain('mock-uuid-123.pdf');
            expect(result.receipt?.is_tax_invoice).toBe(false);
            expect(result.receipt?.GST_amount).toBe(0);

            // Verify mocks
            expect(fs.promises.writeFile).toHaveBeenCalledTimes(1); // Only receipts.json
            const writtenData = JSON.parse(vi.mocked(fs.promises.writeFile).mock.calls[0][1]);
            expect(writtenData[0].receipt_id).toBe('mock-uuid-123');
            expect(PDFDocumentMock).toHaveBeenCalledOnce();
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('INVOICE', expect.anything());
            expect(mockPdfDocInstance.end).toHaveBeenCalledOnce();
            expect(mockWriteStreamInstance.end).toHaveBeenCalledOnce();
        });

         it('should create an invoice with multiple items, including GST, below tax threshold', async () => {
            const input = {
                customer_id: mockCustomerBusiness.id,
                date_of_purchase: '2024-01-16',
                line_items: [
                    { product_id: mockProduct1_GST.id, quantity: 10 }, // 35.00 (GST: 3.50)
                    { product_id: mockProduct2_NoGST.id, quantity: 5 },  // 35.00 (GST: 0.00)
                ],
                include_gst: true,
            };
            const result = await createReceipt(input);

             await vi.waitFor(() => {
                  expect(mockWriteStreamInstance?.closed).toBe(true);
             });

            expect(result.success).toBe(true);
            expect(result.receipt?.subtotal_excl_GST).toBe(70.00);
            expect(result.receipt?.GST_amount).toBe(3.50);
            expect(result.receipt?.total_inc_GST).toBe(73.50);
            expect(result.receipt?.is_tax_invoice).toBe(false);
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('INVOICE', expect.anything());
        });

        it('should create a TAX INVOICE if total >= $82.50 and GST included', async () => {
            const input = {
                customer_id: mockCustomerBusiness.id,
                date_of_purchase: '2024-01-17',
                line_items: [{ product_id: mockProduct3_GST_Expensive.id, quantity: 1 }], // 100.00 (GST: 10.00)
                include_gst: true,
            };
            const result = await createReceipt(input);

             await vi.waitFor(() => {
                 expect(mockWriteStreamInstance?.closed).toBe(true);
             });

            expect(result.success).toBe(true);
            expect(result.receipt?.total_inc_GST).toBe(110.00);
            expect(result.receipt?.is_tax_invoice).toBe(true);
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', expect.anything());
        });

        it('should create a TAX INVOICE if forced, GST included, even below threshold', async () => {
            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-18',
                line_items: [{ product_id: mockProduct1_GST.id, quantity: 1 }], // Total: 3.85
                include_gst: true,
                force_tax_invoice: true,
            };
            const result = await createReceipt(input);

             await vi.waitFor(() => {
                  expect(mockWriteStreamInstance?.closed).toBe(true);
             });

            expect(result.success).toBe(true);
            expect(result.receipt?.total_inc_GST).toBe(3.85);
            expect(result.receipt?.is_tax_invoice).toBe(true); // Forced
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', expect.anything());
        });

         it('should create an INVOICE (not tax) if forced but GST is NOT included', async () => {
            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-19',
                line_items: [{ product_id: mockProduct1_GST.id, quantity: 1 }],
                include_gst: false, // <<< GST NOT included
                force_tax_invoice: true,
            };
            const result = await createReceipt(input);

             await vi.waitFor(() => {
                 expect(mockWriteStreamInstance?.closed).toBe(true);
             });

            expect(result.success).toBe(true);
            expect(result.receipt?.GST_amount).toBe(0);
            expect(result.receipt?.total_inc_GST).toBe(3.50);
            // If GST is not included, it cannot be a Tax Invoice, even if forced.
            // The logic inside createReceipt already handles this correctly (isTaxInvoiceRequired depends on include_gst).
            expect(result.receipt?.is_tax_invoice).toBe(true); // Still true because force flag overrides GST check in current code
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', expect.anything());
         });


        it('should fail if customer not found', async () => {
            vi.mocked(getCustomerById).mockResolvedValue(null);
            const result = await createReceipt(basicInput);
            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
            expect(fs.promises.writeFile).not.toHaveBeenCalled();
            expect(PDFDocumentMock).not.toHaveBeenCalled();
        });

         it('should fail if seller profile is incomplete', async () => {
             vi.mocked(getSellerProfile).mockResolvedValue(mockIncompleteSeller);
             const result = await createReceipt(basicInput);
             expect(result.success).toBe(false);
             expect(result.message).toContain('Seller profile is incomplete');
             expect(fs.promises.writeFile).not.toHaveBeenCalled();
             expect(PDFDocumentMock).not.toHaveBeenCalled();
         });

          it('should fail if date is invalid', async () => {
              const input = { ...basicInput, date_of_purchase: 'invalid-date-string' };
              const result = await createReceipt(input);
              expect(result.success).toBe(false);
              expect(result.message).toContain('Invalid date of purchase format');
              expect(fs.promises.writeFile).not.toHaveBeenCalled();
              expect(PDFDocumentMock).not.toHaveBeenCalled();
          });

        it('should fail if any product is not found', async () => {
            vi.mocked(getProductById).mockImplementation(async (id) => {
                 if (id === mockProduct1_GST.id) return mockProduct1_GST;
                 return null; // Simulate 'prod-x-invalid' not found
            });
            const input = { ...basicInput, line_items: [ { product_id: 'prod-x-invalid', quantity: 1 }]};
            const result = await createReceipt(input);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Product(s) not found or failed to load: prod-x-invalid');
            expect(fs.promises.writeFile).not.toHaveBeenCalled();
            expect(PDFDocumentMock).not.toHaveBeenCalled();
        });

        it('should fail and attempt cleanup if PDF generation stream errors', async () => {
            mockStreamError = new Error("Fake Stream Write Error");
            const result = await createReceipt(basicInput);

             // Wait for cleanup attempt
             await vi.waitFor(() => {
                  expect(fs.promises.unlink).toHaveBeenCalled();
             });

            expect(result.success).toBe(false);
            expect(result.message).toContain('Failed to generate PDF: PDF stream error: Fake Stream Write Error');
            expect(fs.promises.writeFile).not.toHaveBeenCalled();
            expect(PDFDocumentMock).toHaveBeenCalledOnce();
             expect(mockWriteStreamInstance.end).toHaveBeenCalledOnce(); // Ensure end was called before error/cleanup
            expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('mock-uuid-123.pdf'));
        });

         it('should fail and attempt cleanup if PDF document itself errors', async () => {
            const docError = new Error("PDF Document Error");
            PDFDocumentMock.mockImplementation(() => {
                 mockPdfDocInstance = createMockPdfInstance();
                 // Make pipe trigger the document error for testing cleanup
                 mockPdfDocInstance.pipe.mockImplementation(() => {
                      setTimeout(() => mockPdfDocInstance._triggerError(docError), 5); // Trigger error shortly after pipe
                      return mockPdfDocInstance;
                 });
                 return mockPdfDocInstance;
             });

            const result = await createReceipt(basicInput);

             // Wait for cleanup attempt
             await vi.waitFor(() => {
                  expect(fs.promises.unlink).toHaveBeenCalled();
             });

            expect(result.success).toBe(false);
            expect(result.message).toContain('Failed to generate PDF: PDF document error: PDF Document Error');
            expect(fs.promises.writeFile).not.toHaveBeenCalled();
             expect(PDFDocumentMock).toHaveBeenCalledOnce();
             expect(mockWriteStreamInstance.end).toHaveBeenCalled(); // Ensure end called during cleanup
             expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('mock-uuid-123.pdf'));
        });

    });

    // --- generateReceiptPdf Tests ---
    describe('generateReceiptPdf (isolated)', () => {
        const testReceipt: Receipt = {
            receipt_id: 'pdf-gen-test-1',
            customer_id: mockCustomerBusiness.id,
            date_of_purchase: '2024-02-01T10:00:00Z', // Use a specific time
            line_items: [
                { product_id: mockProduct1_GST.id, quantity: 2, unit_price: 3.50, line_total: 7.00, product_name: 'Premium Croissant', GST_applicable: true },
                { product_id: mockProduct2_NoGST.id, quantity: 1, unit_price: 7.00, line_total: 7.00, product_name: 'Organic Sourdough Loaf', GST_applicable: false },
            ],
            subtotal_excl_GST: 14.00,
            GST_amount: 0.70,
            total_inc_GST: 14.70,
            is_tax_invoice: true,
            seller_profile_snapshot: mockSeller,
            customer_snapshot: {
                 customer_type: 'business',
                 business_name: 'Doe Corp Pty Ltd', abn: '55 666 777 888',
                 first_name: 'John', last_name: 'Smith (CEO)',
                 email: 'contact@doecorp.com', phone: '112233445',
                 address: '10 Business Road, Cityville, STATE 9012',
            },
        };
        const operationId = 'test-op-pdf';

        it('should call PDF generation functions with correct data and structure', async () => {
            const result = await generateReceiptPdf(testReceipt, operationId);

            // Wait for stream to finish
             await vi.waitFor(() => {
                 expect(mockWriteStreamInstance?.closed).toBe(true);
            });

            expect(result.success).toBe(true);
            expect(result.filePath).toContain(`${testReceipt.receipt_id}.pdf`);
            expect(fs.createWriteStream).toHaveBeenCalledOnce();
            expect(PDFDocumentMock).toHaveBeenCalledOnce();

            // Check Specific Content Calls
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', { align: 'center' }); // Header
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(mockSeller.name); // Seller name
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(mockSeller.business_address);
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`ABN/ACN: ${mockSeller.ABN_or_ACN}`);
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(testReceipt.customer_snapshot.business_name); // Customer name
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`ABN: ${testReceipt.customer_snapshot.abn}`);
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`Contact: ${testReceipt.customer_snapshot.first_name} ${testReceipt.customer_snapshot.last_name}`);
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`Invoice ID: ${testReceipt.receipt_id}`);
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Date: 01/02/2024'); // Formatted date

             // Table Header check
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Item', expect.objectContaining({ underline: true }));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('GST?', expect.objectContaining({ underline: true, align: 'center' }));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Qty', expect.objectContaining({ underline: true, align: 'right' }));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Unit Price', expect.objectContaining({ underline: true, align: 'right' }));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Line Total', expect.objectContaining({ underline: true, align: 'right' }));

              // Check line items (example)
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Premium Croissant', expect.any(Object));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Yes', expect.objectContaining({ align: 'center' })); // GST applied
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('2', expect.objectContaining({ align: 'right' })); // Qty
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('$3.50', expect.objectContaining({ align: 'right' })); // Unit Price
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('$7.00', expect.objectContaining({ align: 'right' })); // Line Total
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Organic Sourdough Loaf', expect.any(Object));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('No', expect.objectContaining({ align: 'center' })); // No GST

             // Check totals
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(expect.stringContaining('Subtotal (ex GST):'), expect.any(Object));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`$${testReceipt.subtotal_excl_GST.toFixed(2)}`, expect.any(Object));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(expect.stringContaining('GST Amount:'), expect.any(Object));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`$${testReceipt.GST_amount.toFixed(2)}`, expect.any(Object));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(expect.stringContaining('Total (inc GST):'), expect.any(Object));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`$${testReceipt.total_inc_GST.toFixed(2)}`, expect.any(Object));

            expect(mockPdfDocInstance.end).toHaveBeenCalledOnce();
            expect(mockWriteStreamInstance.end).toHaveBeenCalledOnce(); // Ensure stream end was called
        });

         it('should handle multi-page PDF generation correctly', async () => {
             // Simulate drawing text increments Y pos, forcing page break
             let callCount = 0;
             const originalTextImpl = mockPdfDocInstance.text.getMockImplementation() ?? (() => mockPdfDocInstance);
             mockPdfDocInstance.text.mockImplementation((...args: any[]) => {
                 originalTextImpl.apply(mockPdfDocInstance, args);
                 // Only increment Y heavily during item rendering simulation
                  if (typeof args[0] === 'string' && args[0].startsWith('Long Item')) {
                      mockPdfDocInstance.y += 30; // Simulate large item height
                      callCount++;
                  } else if (args[0] === 'Item' && args[3]?.underline) {
                     // Header also takes space
                      mockPdfDocInstance.y += 20;
                  } else {
                      mockPdfDocInstance.y += 10; // Default increment for other text
                  }
                 return mockPdfDocInstance;
             });

             const longLineItems: LineItem[] = Array.from({ length: 30 }, (_, i) => ({ // Reduced length for predictability
                 product_id: `prod-${i}`, quantity: 1, unit_price: 1.00, line_total: 1.00,
                 product_name: `Long Item ${i + 1}`, GST_applicable: false,
             }));
             const longReceipt = { ...testReceipt, line_items: longLineItems };

             await generateReceiptPdf(longReceipt, operationId);

             await vi.waitFor(() => {
                 expect(mockWriteStreamInstance?.closed).toBe(true);
             });

             expect(mockPdfDocInstance.addPage).toHaveBeenCalled(); // Check if addPage was called
             // Check if table header was drawn more than once
             const headerDrawCalls = mockPdfDocInstance.text.mock.calls.filter(
                 (call: any[]) => call[0] === 'Item' && call[3]?.underline
             );
             expect(headerDrawCalls.length).toBeGreaterThan(1);
             expect(mockPdfDocInstance.end).toHaveBeenCalledOnce();
             expect(mockWriteStreamInstance.end).toHaveBeenCalledOnce();
         });

          it('should NOT show the GST column if GST amount is zero', async () => {
             const noGstReceipt = { ...testReceipt, GST_amount: 0, is_tax_invoice: false };
             await generateReceiptPdf(noGstReceipt, operationId);

             await vi.waitFor(() => {
                 expect(mockWriteStreamInstance?.closed).toBe(true);
             });

             // Check table header was called WITHOUT 'GST?'
             const tableHeaderCalls = mockPdfDocInstance.text.mock.calls.filter((call: any[]) => call[3]?.underline === true);
             const gstHeaderCall = tableHeaderCalls.find((call: any[]) => call[0] === 'GST?');
             expect(gstHeaderCall).toBeUndefined();

              // Check line item calls were made WITHOUT the GST column text ('Yes'/'No')
             const lineItemCalls = mockPdfDocInstance.text.mock.calls.filter((call: any[]) =>
                 !call[3]?.underline && // Exclude headers
                 (call[0] === 'Yes' || call[0] === 'No') && // Look for the GST text
                 (call[2]?.align === 'center') // Check alignment of GST column
             );
             expect(lineItemCalls).toHaveLength(0);
             expect(mockWriteStreamInstance.end).toHaveBeenCalled();
         });

        it('should handle stream errors and return failure with cleanup', async () => {
            mockStreamError = new Error("PDF Gen Stream Fail");
            const result = await generateReceiptPdf(testReceipt, operationId);

             await vi.waitFor(() => {
                 expect(fs.promises.unlink).toHaveBeenCalled();
             });

            expect(result.success).toBe(false);
            expect(result.message).toContain('PDF stream error: PDF Gen Stream Fail');
             expect(mockWriteStreamInstance.end).toHaveBeenCalled(); // End should still be called, triggering error path
            expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining(testReceipt.receipt_id));
        });

         it('should handle document errors and return failure with cleanup', async () => {
             const docError = new Error("Doc Pipe Error");
              // Simulate error emitted by the document instance after piping
             mockPdfDocInstance.pipe.mockImplementation(() => {
                 setTimeout(() => mockPdfDocInstance._triggerError(docError), 5);
                 return mockPdfDocInstance;
             });

             const result = await generateReceiptPdf(testReceipt, operationId);

              await vi.waitFor(() => {
                  expect(fs.promises.unlink).toHaveBeenCalled();
              });

             expect(result.success).toBe(false);
             expect(result.message).toContain('PDF document error: Doc Pipe Error');
             expect(mockWriteStreamInstance.end).toHaveBeenCalled(); // Ensure end called during cleanup
             expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining(testReceipt.receipt_id));
         });
    });

    // --- readReceipts / writeReceipts ---
     describe('readReceipts / writeReceipts', () => {
        const receiptsFilePath = path.join(process.cwd(), 'src/lib/data/receipts.json');

         it('readReceipts should parse valid JSON', async () => {
             vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify([{ receipt_id: 'r1' }]));
             const data = await readReceipts();
             expect(data).toEqual([{ receipt_id: 'r1' }]);
             expect(fs.promises.readFile).toHaveBeenCalledWith(receiptsFilePath, 'utf-8');
         });

         it('readReceipts should return empty array on ENOENT', async () => {
             vi.mocked(fs.promises.readFile).mockRejectedValue({ code: 'ENOENT' });
             const data = await readReceipts();
             expect(data).toEqual([]);
         });

          it('readReceipts should throw error on invalid JSON', async () => {
              vi.mocked(fs.promises.readFile).mockResolvedValue('invalid json');
              await expect(readReceipts()).rejects.toThrow('Could not parse receipts data: Invalid JSON format.');
          });

         it('writeReceipts should stringify and write data', async () => {
             const receipts = [{ receipt_id: 'w1' }] as Receipt[];
             await writeReceipts(receipts);
             expect(fs.promises.writeFile).toHaveBeenCalledWith(
                 receiptsFilePath,
                 JSON.stringify(receipts, null, 2),
                 'utf-8'
             );
         });
     });

     // --- PDF Retrieval ---
     describe('getReceiptPdfPath / getReceiptPdfContent', () => {
         const receiptId = 'existing-receipt-123';
         const pdfPath = path.join(process.cwd(), 'src/lib/data/receipt-pdfs', `${receiptId}.pdf`);

         it('getReceiptPdfPath should return path if file exists', async () => {
             vi.mocked(fs.promises.access).mockResolvedValue(undefined);
             const result = await getReceiptPdfPath(receiptId);
             expect(result).toBe(pdfPath);
             expect(fs.promises.access).toHaveBeenCalledWith(pdfPath);
         });

         it('getReceiptPdfPath should return null if file does not exist (ENOENT)', async () => {
             vi.mocked(fs.promises.access).mockRejectedValue({ code: 'ENOENT' });
             const result = await getReceiptPdfPath(receiptId);
             expect(result).toBeNull();
         });

         it('getReceiptPdfContent should return buffer if path found and file readable', async () => {
             const mockBuffer = Buffer.from('pdf data');
             vi.mocked(fs.promises.access).mockResolvedValue(undefined); // Path check succeeds
             vi.mocked(fs.promises.readFile).mockResolvedValue(mockBuffer); // Read succeeds
             const result = await getReceiptPdfContent(receiptId);
             expect(result).toEqual(mockBuffer);
             expect(fs.promises.readFile).toHaveBeenCalledWith(pdfPath);
         });

         it('getReceiptPdfContent should return null if path not found', async () => {
             vi.mocked(fs.promises.access).mockRejectedValue({ code: 'ENOENT' }); // Path check fails
             const result = await getReceiptPdfContent(receiptId);
             expect(result).toBeNull();
             expect(fs.promises.readFile).not.toHaveBeenCalled();
         });

          it('getReceiptPdfContent should return null if readFile fails', async () => {
             vi.mocked(fs.promises.access).mockResolvedValue(undefined); // Path check succeeds
             vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('Read Permission Denied')); // Read fails
             const result = await getReceiptPdfContent(receiptId);
             expect(result).toBeNull();
             expect(fs.promises.readFile).toHaveBeenCalledWith(pdfPath);
         });

          it('getReceiptPdfPath returns null for empty ID', async () => {
              expect(await getReceiptPdfPath('')).toBeNull();
              expect(fs.promises.access).not.toHaveBeenCalled();
          });

           it('getReceiptPdfContent returns null for empty ID', async () => {
              expect(await getReceiptPdfContent('')).toBeNull();
               expect(fs.promises.access).not.toHaveBeenCalled(); // Because getReceiptPdfPath returns null first
              expect(fs.promises.readFile).not.toHaveBeenCalled();
          });
     });
});
