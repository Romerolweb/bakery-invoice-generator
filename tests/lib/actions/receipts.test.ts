import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { WriteStream } from 'fs';

// --- Mocking Dependencies ---

// Mock uuid before everything else
vi.mock('uuid', () => ({ v4: () => 'mock-uuid-123' }));

// Mock pdfkit
const mockPdfDocInstance = {
    pipe: vi.fn().mockReturnThis(),
    font: vi.fn().mockReturnThis(),
    fontSize: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    moveDown: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    strokeColor: vi.fn().mockReturnThis(), // Added for lines
    addPage: vi.fn().mockReturnThis(), // Added for page breaks
    end: vi.fn(),
    on: vi.fn().mockReturnThis(),
    page: { // Mock page object for margins/height checks
        height: 792, // Standard Letter height in points
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
    },
    y: 50, // Mock current y position
    writableEnded: false,
};
vi.mock('pdfkit', () => ({
    default: vi.fn().mockImplementation(() => {
        // Reset y position for each new doc instance
        mockPdfDocInstance.y = mockPdfDocInstance.page.margins.top;
        return mockPdfDocInstance;
    }),
}));

// Mock fs module
let mockStreamError: Error | null = null;
let mockStreamFinishCallback: (() => void) | null = null;
const mockWriteStream = {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === 'finish') mockStreamFinishCallback = cb;
        if (event === 'error') setTimeout(() => { if (mockStreamError) cb(mockStreamError); }, 0); // Simulate async error
        return mockWriteStream;
    }),
    end: vi.fn(() => {
        mockWriteStream.writableEnded = true;
        if (mockStreamFinishCallback && !mockStreamError) {
            setTimeout(mockStreamFinishCallback, 0); // Simulate async finish
        }
    }),
    writableEnded: false,
} as unknown as WriteStream & { on: vi.Mock; end: vi.Mock; writableEnded: boolean };

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
    // Use a factory for createWriteStream to reset state
    createWriteStream: vi.fn().mockImplementation(() => {
        // Reset stream state for each call
        mockStreamError = null;
        mockStreamFinishCallback = null;
        mockWriteStream.writableEnded = false;
        mockWriteStream.on.mockClear();
        mockWriteStream.end.mockClear();
        return mockWriteStream;
    }),
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
// Must be imported *after* all mocks are set up
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
    name: 'Test Bakery', business_address: '1 Test St', ABN_or_ACN: '11 222', contact_email: 't@b.com', phone: '123', logo_url: '',
};
const mockCustomerIndividual: Customer = {
    id: 'cust-ind-1', customer_type: 'individual', first_name: 'Jane', last_name: 'Doe', email: 'j@e.com', phone: '987', address: '5 Sample Ave',
};
const mockCustomerBusiness: Customer = {
    id: 'cust-biz-1', customer_type: 'business', business_name: 'Doe Corp', abn: '55 666', first_name: 'John', last_name: 'Smith', email: 'c@d.com', phone: '112', address: '10 Biz Rd',
};
const mockProduct1_GST: Product = { id: 'prod-1', name: 'Croissant', unit_price: 3.50, GST_applicable: true };
const mockProduct2_NoGST: Product = { id: 'prod-2', name: 'Sourdough', unit_price: 7.00, GST_applicable: false };
const mockProduct3_GST_Expensive: Product = { id: 'prod-3', name: 'Coffee Machine', unit_price: 100.00, GST_applicable: true };

// --- Test Suite ---
describe('Receipt Actions', () => {

    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();

        // Setup default mock implementations
        (fs.readFile as vi.Mock).mockResolvedValue('[]'); // Default: empty receipts file
        (fs.writeFile as vi.Mock).mockResolvedValue(undefined);
        (fs.mkdir as vi.Mock).mockResolvedValue(undefined);
        (fs.access as vi.Mock).mockResolvedValue(undefined); // Assume files exist
        (fs.unlink as vi.Mock).mockResolvedValue(undefined);

        (getSellerProfile as vi.Mock).mockResolvedValue(mockSeller);
        (getCustomerById as vi.Mock).mockImplementation(async (id) => {
            if (id === mockCustomerIndividual.id) return mockCustomerIndividual;
            if (id === mockCustomerBusiness.id) return mockCustomerBusiness;
            return null;
        });
         (getProductById as vi.Mock).mockImplementation(async (id) => {
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

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.pdfPath).toBeDefined();
            expect(result.receipt?.receipt_id).toBe('mock-uuid-123');
            expect(result.receipt?.customer_id).toBe(mockCustomerIndividual.id);
            expect(result.receipt?.line_items).toHaveLength(1);
            expect(result.receipt?.line_items[0].product_id).toBe(mockProduct2_NoGST.id);
            expect(result.receipt?.line_items[0].quantity).toBe(2);
            expect(result.receipt?.line_items[0].unit_price).toBe(7.00);
            expect(result.receipt?.line_items[0].line_total).toBe(14.00);
            expect(result.receipt?.subtotal_excl_GST).toBe(14.00);
            expect(result.receipt?.GST_amount).toBe(0);
            expect(result.receipt?.total_inc_GST).toBe(14.00);
            expect(result.receipt?.is_tax_invoice).toBe(false);
            expect(result.receipt?.customer_snapshot.first_name).toBe('Jane');
            expect(result.receipt?.seller_profile_snapshot.name).toBe('Test Bakery');

            // Verify save and PDF generation occurred
            expect(fs.writeFile).toHaveBeenCalledOnce();
            const writtenData = JSON.parse((fs.writeFile as vi.Mock).mock.calls[0][1]);
            expect(writtenData[0].receipt_id).toBe('mock-uuid-123');
            expect(PDFDocument).toHaveBeenCalledOnce();
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('INVOICE', expect.anything()); // Check PDF title
        });

        it('should create an invoice with multiple items, including GST, below tax threshold', async () => {
            const input = {
                customer_id: mockCustomerBusiness.id,
                date_of_purchase: '2024-01-16',
                line_items: [
                    { product_id: mockProduct1_GST.id, quantity: 10 }, // 35.00 (GST: 3.50)
                    { product_id: mockProduct2_NoGST.id, quantity: 5 },  // 35.00 (GST: 0.00)
                ],
                include_gst: true, // GST *can* be applied
            };
            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.line_items).toHaveLength(2);
            expect(result.receipt?.subtotal_excl_GST).toBe(70.00); // 35 + 35
            expect(result.receipt?.GST_amount).toBe(3.50); // 10% of 35.00 (only product 1)
            expect(result.receipt?.total_inc_GST).toBe(73.50); // 70 + 3.50
            expect(result.receipt?.is_tax_invoice).toBe(false); // Total < 82.50
            expect(result.receipt?.customer_snapshot.business_name).toBe('Doe Corp');
            expect(PDFDocument).toHaveBeenCalledOnce();
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('INVOICE', expect.anything());
        });

        it('should create a TAX INVOICE if total >= $82.50 and GST included', async () => {
            const input = {
                customer_id: mockCustomerBusiness.id,
                date_of_purchase: '2024-01-17',
                line_items: [
                    { product_id: mockProduct3_GST_Expensive.id, quantity: 1 }, // 100.00 (GST: 10.00)
                ],
                include_gst: true,
            };
            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.subtotal_excl_GST).toBe(100.00);
            expect(result.receipt?.GST_amount).toBe(10.00);
            expect(result.receipt?.total_inc_GST).toBe(110.00);
            expect(result.receipt?.is_tax_invoice).toBe(true); // Total >= 82.50
             expect(PDFDocument).toHaveBeenCalledOnce();
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', expect.anything());
        });

         it('should create a TAX INVOICE if forced, even if below threshold and GST applied', async () => {
            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-18',
                line_items: [{ product_id: mockProduct1_GST.id, quantity: 1 }], // Total: 3.85
                include_gst: true, // GST is applied
                force_tax_invoice: true, // Force it
            };
            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.total_inc_GST).toBe(3.85);
            expect(result.receipt?.is_tax_invoice).toBe(true); // Forced
            expect(PDFDocument).toHaveBeenCalledOnce();
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', expect.anything());
        });

         it('should create an INVOICE (not tax) if forced but GST is NOT included', async () => {
            const input = {
                customer_id: mockCustomerIndividual.id,
                date_of_purchase: '2024-01-19',
                line_items: [{ product_id: mockProduct1_GST.id, quantity: 1 }], // Total: 3.50
                include_gst: false, // GST is NOT applied
                force_tax_invoice: true, // Force it (should be ignored if no GST applied)
            };
            const result = await createReceipt(input);

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
             expect(result.receipt?.GST_amount).toBe(0);
            expect(result.receipt?.total_inc_GST).toBe(3.50);
            expect(result.receipt?.is_tax_invoice).toBe(false); // Not a tax invoice if GST wasn't calculated
            expect(PDFDocument).toHaveBeenCalledOnce();
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('INVOICE', expect.anything());
        });

        it('should fail if customer not found', async () => {
             (getCustomerById as vi.Mock).mockResolvedValue(null);
            const result = await createReceipt(basicInput);
            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
            expect(fs.writeFile).not.toHaveBeenCalled();
             expect(PDFDocument).not.toHaveBeenCalled();
        });

        it('should fail if any product is not found', async () => {
             (getProductById as vi.Mock).mockImplementation(async (id) => {
                 if (id === mockProduct1_GST.id) return mockProduct1_GST;
                 return null; // Simulate not found
            });
             const input = {
                ...basicInput,
                 line_items: [
                    { product_id: mockProduct1_GST.id, quantity: 1 },
                    { product_id: 'prod-x-invalid', quantity: 1 }
                ],
            };
            const result = await createReceipt(input);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Product(s) not found or failed to load: prod-x-invalid');
             expect(fs.writeFile).not.toHaveBeenCalled();
            expect(PDFDocument).not.toHaveBeenCalled();
        });

         it('should fail validation if line items array is empty', async () => {
            const input = { ...basicInput, line_items: [] };
            const result = await createReceipt(input);
            expect(result.success).toBe(false);
             expect(result.message).toContain('at least one line item');
             expect(fs.writeFile).not.toHaveBeenCalled();
             expect(PDFDocument).not.toHaveBeenCalled();
        });

        it('should fail validation if a line item has quantity <= 0', async () => {
             const input = { ...basicInput, line_items: [{ product_id: mockProduct2_NoGST.id, quantity: 0 }] };
             const result = await createReceipt(input);
             expect(result.success).toBe(false);
             expect(result.message).toContain('quantity greater than 0');
             expect(fs.writeFile).not.toHaveBeenCalled();
             expect(PDFDocument).not.toHaveBeenCalled();
         });


        it('should fail and attempt cleanup if PDF generation stream errors', async () => {
            // Setup stream to error
             mockStreamError = new Error("Fake Stream Write Error");

             const result = await createReceipt(basicInput);

             expect(result.success).toBe(false);
             expect(result.message).toContain('PDF stream error: Fake Stream Write Error');
             expect(fs.writeFile).not.toHaveBeenCalled(); // Receipt data should not be saved
             expect(PDFDocument).toHaveBeenCalledOnce(); // PDF generation was attempted
             expect(fs.unlink).toHaveBeenCalledOnce(); // Cleanup should be attempted
             expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('mock-uuid-123.pdf'));
        });

         it('should fail and attempt cleanup if PDF document itself errors', async () => {
             // Simulate an error during PDF content addition (e.g., invalid font)
             vi.spyOn(mockPdfDocInstance, 'text').mockImplementation(() => {
                 // Simulate error after some calls
                 if (mockPdfDocInstance.text.mock.calls.length > 5) {
                      mockPdfDocInstance.emit('error', new Error("Invalid PDF operation")); // Emit error on doc
                     throw new Error("Invalid PDF operation"); // Also throw to stop execution flow
                 }
                 return mockPdfDocInstance;
             });
            vi.spyOn(mockPdfDocInstance, 'emit'); // Spy on emit to verify

            const result = await createReceipt(basicInput);

            expect(result.success).toBe(false);
            expect(result.message).toContain('Failed to generate PDF: Invalid PDF operation'); // Error propagates
            expect(fs.writeFile).not.toHaveBeenCalled();
            expect(PDFDocument).toHaveBeenCalledOnce();
             expect(mockPdfDocInstance.emit).toHaveBeenCalledWith('error', expect.any(Error));
             expect(fs.unlink).toHaveBeenCalledOnce(); // Cleanup attempted
        });
    });

    // --- generateReceiptPdf Tests ---
    describe('generateReceiptPdf (isolated)', () => {
        const testReceipt: Receipt = {
            receipt_id: 'pdf-gen-test-1',
            customer_id: mockCustomerBusiness.id,
            date_of_purchase: '2024-02-01T00:00:00Z',
            line_items: [
                { product_id: mockProduct1_GST.id, quantity: 2, unit_price: 3.50, line_total: 7.00, product_name: 'Croissant', GST_applicable: true },
                { product_id: mockProduct2_NoGST.id, quantity: 1, unit_price: 7.00, line_total: 7.00, product_name: 'Sourdough', GST_applicable: false },
            ],
            subtotal_excl_GST: 14.00,
            GST_amount: 0.70, // 10% of 7.00
            total_inc_GST: 14.70,
            is_tax_invoice: true, // Mark as Tax Invoice for this test
            seller_profile_snapshot: mockSeller,
            customer_snapshot: { // Snapshot of business customer
                 customer_type: 'business',
                 business_name: 'Doe Corp',
                 abn: '55 666',
                 first_name: 'John',
                 last_name: 'Smith',
                 email: 'c@d.com',
                 phone: '112',
                 address: '10 Biz Rd',
            },
        };

         it('should call PDF generation functions with correct data and structure', async () => {
            const result = await generateReceiptPdf(testReceipt);

             expect(result.success).toBe(true);
             expect(result.filePath).toContain('pdf-gen-test-1.pdf');
             expect(fs.createWriteStream).toHaveBeenCalledOnce();
             expect(PDFDocument).toHaveBeenCalledOnce();

            // Verify structure calls (order matters less than presence)
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('TAX INVOICE', { align: 'center' }); // Header
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('From:', { underline: true }); // Seller
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(mockSeller.name, expect.anything());
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('To:', { underline: true }); // Customer
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(testReceipt.customer_snapshot.business_name, expect.anything());
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`ABN: ${testReceipt.customer_snapshot.abn}`, expect.anything());
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`Invoice ID: ${testReceipt.receipt_id}`); // Details
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Item', expect.objectContaining({ underline: true })); // Table Header
             // Check line item details were added (example)
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Croissant', expect.objectContaining({ width: expect.any(Number) }));
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('Yes', expect.objectContaining({ align: 'center' })); // GST column check
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith('$7.00', expect.objectContaining({ align: 'right' })); // Line total
             // Check totals section
            expect(mockPdfDocInstance.text).toHaveBeenCalledWith(expect.stringContaining('Subtotal'), expect.anything());
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`$${testReceipt.subtotal_excl_GST.toFixed(2)}`, expect.anything());
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(expect.stringContaining('Total (inc GST)'), expect.anything());
             expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`$${testReceipt.total_inc_GST.toFixed(2)}`, expect.objectContaining({ bold: true }));
             expect(mockPdfDocInstance.stroke).toHaveBeenCalled(); // Lines drawn
             expect(mockPdfDocInstance.end).toHaveBeenCalledOnce();
         });

         it('should NOT show the GST column if GST amount is zero', async () => {
            const noGstReceipt = { ...testReceipt, GST_amount: 0, is_tax_invoice: false };
             const result = await generateReceiptPdf(noGstReceipt);

             expect(result.success).toBe(true);
             // Check table header was called WITHOUT 'GST?'
             const tableHeaderCalls = mockPdfDocInstance.text.mock.calls.filter((call: any[]) => call[1]?.underline === true);
             const gstHeaderCall = tableHeaderCalls.find((call: any[]) => call[0] === 'GST?');
            expect(gstHeaderCall).toBeUndefined();

             // Check line item calls were made WITHOUT the GST column text ('Yes'/'No')
             const lineItemCalls = mockPdfDocInstance.text.mock.calls.filter((call: any[]) =>
                 !call[1]?.underline && // Exclude headers
                 (call[0] === 'Yes' || call[0] === 'No') && // Look for the GST text
                 call[2]?.align === 'center' // Check alignment used for GST col
            );
            expect(lineItemCalls).toHaveLength(0);
         });

         it('should handle stream errors gracefully and return failure', async () => {
            mockStreamError = new Error("PDF Gen Stream Fail");
             const result = await generateReceiptPdf(testReceipt);

             expect(result.success).toBe(false);
             expect(result.message).toContain('PDF stream error: PDF Gen Stream Fail');
             expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining(testReceipt.receipt_id));
         });

          it('should handle document errors gracefully and return failure', async () => {
             vi.spyOn(mockPdfDocInstance, 'text').mockImplementation(() => { throw new Error("Doc Text Error"); });
             vi.spyOn(mockPdfDocInstance, 'emit');
             const result = await generateReceiptPdf(testReceipt);

             expect(result.success).toBe(false);
             expect(result.message).toContain('Failed to generate PDF: Doc Text Error');
             expect(mockPdfDocInstance.emit).not.toHaveBeenCalledWith('error', expect.any(Error)); // Error thrown directly
             expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining(testReceipt.receipt_id));
         });
    });

    // --- readReceipts / writeReceipts ---
     describe('readReceipts / writeReceipts', () => {
         it('readReceipts should parse JSON or return empty array on ENOENT', async () => {
             (fs.readFile as vi.Mock).mockResolvedValue(JSON.stringify([{ id: 'r1' }]));
             let data = await readReceipts();
             expect(data).toEqual([{ id: 'r1' }]);

             (fs.readFile as vi.Mock).mockRejectedValue({ code: 'ENOENT' });
             data = await readReceipts();
             expect(data).toEqual([]);
         });

         it('writeReceipts should stringify and write data', async () => {
             const receipts = [{ receipt_id: 'w1' }];
             await writeReceipts(receipts as any);
             expect(fs.writeFile).toHaveBeenCalledWith(
                 expect.any(String), // Path
                 JSON.stringify(receipts, null, 2), // Data
                 'utf-8'
             );
         });
     });

     // --- PDF Retrieval ---
     describe('getReceiptPdfPath / getReceiptPdfContent', () => {
         const receiptId = 'existing-receipt-123';
         const pdfPath = path.join(process.cwd(), 'src/lib/data/receipt-pdfs', `${receiptId}.pdf`);
         const mockReceipt: Receipt = { // Need a basic receipt object for getReceiptById
             receipt_id: receiptId, customer_id: 'cust-1', date_of_purchase: '2024-01-01T00:00:00Z', line_items: [], subtotal_excl_GST: 0, GST_amount: 0, total_inc_GST: 0, is_tax_invoice: false, seller_profile_snapshot: mockSeller, customer_snapshot: mockCustomerIndividual
         };

         beforeEach(() => {
             // Mock getReceiptById for retrieval tests
             vi.mocked(readReceipts).mockResolvedValue([mockReceipt]);
             // Reset fs.access mock for specific tests
             vi.mocked(fs.access).mockReset();
         });

         // getReceiptPdfPath
         it('getReceiptPdfPath should return path if file exists', async () => {
             vi.mocked(fs.access).mockResolvedValue(undefined); // Simulate file exists
             const result = await getReceiptPdfPath(receiptId);
             expect(result).toBe(pdfPath);
             expect(fs.access).toHaveBeenCalledWith(pdfPath);
         });

         it('getReceiptPdfPath should return null if file does not exist', async () => {
             vi.mocked(fs.access).mockRejectedValue(new Error('File not found')); // Simulate not found
             const result = await getReceiptPdfPath(receiptId);
             expect(result).toBeNull();
             expect(fs.access).toHaveBeenCalledWith(pdfPath);
         });

         it('getReceiptPdfPath should return null if receipt does not exist', async () => {
             vi.mocked(readReceipts).mockResolvedValue([]); // No receipts found
             const result = await getReceiptPdfPath('non-existent-id');
             expect(result).toBeNull();
             expect(fs.access).not.toHaveBeenCalled(); // Shouldn't even check fs if receipt missing
         });

         // getReceiptPdfContent
         it('getReceiptPdfContent should return buffer if file exists and is readable', async () => {
             const mockBuffer = Buffer.from('pdf content');
             vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
             vi.mocked(fs.readFile).mockResolvedValue(mockBuffer); // File readable

             const result = await getReceiptPdfContent(receiptId);
             expect(result).toBeInstanceOf(Buffer);
             expect(result).toEqual(mockBuffer);
             expect(fs.access).toHaveBeenCalledWith(pdfPath);
             expect(fs.readFile).toHaveBeenCalledWith(pdfPath);
         });

         it('getReceiptPdfContent should return null if PDF path is not found', async () => {
             vi.mocked(fs.access).mockRejectedValue(new Error('File not found')); // File doesn't exist
             const result = await getReceiptPdfContent(receiptId);
             expect(result).toBeNull();
             expect(fs.readFile).not.toHaveBeenCalled(); // Shouldn't try to read if access failed
         });

         it('getReceiptPdfContent should return null if reading file fails', async () => {
             vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
             vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error')); // Reading fails

             const result = await getReceiptPdfContent(receiptId);
             expect(result).toBeNull();
             expect(fs.readFile).toHaveBeenCalledWith(pdfPath);
         });
     });

});

```