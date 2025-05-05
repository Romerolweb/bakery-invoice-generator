import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PdfGenerator } from '@/lib/services/pdfGenerator';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { format, parseISO } from 'date-fns';
import PDFDocument from 'pdfkit';
import { logger } from '@/lib/services/logging';
import { LineItem, Customer, SellerProfile, Receipt } from '@/lib/types';

vi.mock('fs');
vi.mock('path');
vi.mock('pdfkit');
vi.mock('date-fns');
vi.mock('@/lib/services/logging');

describe('PdfGenerator', () => {
    let pdfGenerator: PdfGenerator;
    const mockReceiptId = 'test-receipt';
    const mockOperationId = 'test-operation';
    const mockFilePath = '/mock/path/to/test-receipt.pdf';
    const mockPdfDir = '/mock/path/to/pdf-dir';
    const mockFontsDir = '/mock/path/to/fonts';

    beforeEach(() => {
        vi.clearAllMocks();
        pdfGenerator = new PdfGenerator();

        // Mock path.join
        vi.mocked(path.join).mockImplementation((...args) => {
            if (args.includes('receipt-pdfs')) {
                return mockPdfDir;
            }
            if (args.includes('fonts')) {
                return mockFontsDir;
            }
            return args.join('/');
        });

         // Mock fsPromises.mkdir
         vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);

        // Mock accessSync
         vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
        
        // Mock unlink
        vi.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);

          // Mock date-fns functions
          vi.mocked(format).mockImplementation((date) => `Formatted ${date}`);
          vi.mocked(parseISO).mockImplementation((dateString) => new Date(dateString));

         // Mock PDFDocument creation
        const mockPDFDocumentInstance = {
            pipe: vi.fn(),
            fontSize: vi.fn().mockReturnThis(),
            font: vi.fn().mockReturnThis(),
            text: vi.fn().mockReturnThis(),
            moveDown: vi.fn().mockReturnThis(),
            addPage: vi.fn().mockReturnThis(),
            heightOfString: vi.fn().mockReturnValue(10),
            y: 50,
            page:{margins: {left: 50, bottom: 50}, width: 612, height: 792},
            moveTo: vi.fn().mockReturnThis(),
            lineTo: vi.fn().mockReturnThis(),
            strokeColor: vi.fn().mockReturnThis(),
            stroke: vi.fn().mockReturnThis(),
            end: vi.fn(),
            on: vi.fn()
        };
       vi.mocked(PDFDocument).mockReturnValue(mockPDFDocumentInstance as any);

          // Mock logger
          vi.mocked(logger.info).mockImplementation(() => { });
          vi.mocked(logger.debug).mockImplementation(() => { });
          vi.mocked(logger.warn).mockImplementation(() => { });
          vi.mocked(logger.error).mockImplementation(() => { });

    });

    afterEach(() => {
       
    });

    it('should ensure PDF directory exists', async () => {
        await (pdfGenerator as any)._ensurePdfDirectoryExists();
        expect(fsPromises.mkdir).toHaveBeenCalledWith(mockPdfDir, { recursive: true });
    });

    it('should check if required fonts exist', () => {
         (pdfGenerator as any)._checkRequiredFontsExist();
         expect(fsPromises.access).toHaveBeenCalledTimes(2);
    });

    it('should initialize PDF document', () => {
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         expect(PDFDocument).toHaveBeenCalled();
    });

    it('should add header', () => {
          (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addHeader(true);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('TAX INVOICE', { align: 'center' });
    });

    it('should add seller info', () => {
        const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addSellerInfo(mockSeller);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('test seller');
    });

    it('should add customer info', () => {
        const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addCustomerInfo(mockCustomer);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith("test customer");
    });

    it('should add invoice details', () => {
        const mockDate = '2024-01-01';
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addInvoiceDetails(mockReceiptId, mockDate);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith(`Invoice ID: ${mockReceiptId}`);
         expect(format).toHaveBeenCalledWith(new Date(mockDate), 'dd/MM/yyyy');
    });

    it('should add line items', () => {
        const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addLineItemsTable(mockLineItems, false);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('Test Product', expect.anything(), expect.anything(), expect.anything());
    });

    it('should add totals', () => {
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addTotals(100, 10, 110);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('$110.00', expect.anything(), expect.anything(), expect.anything());
    });

    it('should finalize PDF', async () => {
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         await (pdfGenerator as any)._setupStream();
         const stream = vi.mocked(PDFDocument).mock.results[0].value.pipe.mock.calls[0][0];
         stream.emit('finish');
         await (pdfGenerator as any)._finalize();
         expect(vi.mocked(PDFDocument).mock.results[0].value.end).toHaveBeenCalled();
    });

     it('should clean up failed PDF', async () => {
          (pdfGenerator as any)._filePath = mockFilePath;
        await (pdfGenerator as any)._cleanupFailedPdf();
        expect(fsPromises.unlink).toHaveBeenCalledWith(mockFilePath);
    });

    it('should generate PDF successfully', async () => {
       const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
        const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
        const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
        const mockReceipt: Receipt = {
            receipt_id: mockReceiptId, customer_id: 'test-customer', date_of_purchase: '2024-01-01', line_items: mockLineItems, subtotal_excl_GST: 100, GST_amount: 10, total_inc_GST: 110, is_tax_invoice: true, seller_profile_snapshot: mockSeller, customer_snapshot: mockCustomer
        };
         (pdfGenerator as any)._filePath = mockFilePath;
        const stream = vi.mocked(PDFDocument).mock.results[0].value.pipe.mock.calls[0][0];
        stream.emit('finish');
        const result = await pdfGenerator.generate(mockReceipt, mockOperationId);
        expect(result.success).toBe(true);
    });
   it('should handle concurrency', async () => {
    const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
    const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
    const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
    const mockReceipt: Receipt = {
        receipt_id: mockReceiptId, customer_id: 'test-customer', date_of_purchase: '2024-01-01', line_items: mockLineItems, subtotal_excl_GST: 100, GST_amount: 10, total_inc_GST: 110, is_tax_invoice: true, seller_profile_snapshot: mockSeller, customer_snapshot: mockCustomer
    };

    // First request
    const pdfGenerator1 = new PdfGenerator();
    const promise1 = pdfGenerator1.generate(mockReceipt, mockOperationId);

    // Second concurrent request
    const pdfGenerator2 = new PdfGenerator();
    const promise2 = pdfGenerator2.generate(mockReceipt, mockOperationId);

    // Ensure the second request fails
    const result2 = await promise2;
    expect(result2.success).toBe(false);
    expect(result2.message).toContain('Another PDF generation is currently in progress.');

    // Wait for the first request to complete and ensure it's successful
    const stream = vi.mocked(PDFDocument).mock.results[0].value.pipe.mock.calls[0][0];
    stream.emit('finish');
    const result1 = await promise1;
        expect(result1.success).toBe(true);
});

     it('should handle error during generation', async () => {
        const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
        const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
        const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
        const mockReceipt: Receipt = {
            receipt_id: mockReceiptId, customer_id: 'test-customer', date_of_purchase: '2024-01-01', line_items: mockLineItems, subtotal_excl_GST: 100, GST_amount: 10, total_inc_GST: 110, is_tax_invoice: true, seller_profile_snapshot: mockSeller, customer_snapshot: mockCustomer
        };
         // Simulate an error by rejecting the stream setup
         vi.mocked(PDFDocument).mockImplementation(() => {
            throw new Error('Simulated PDF generation error');
        });
        const result = await pdfGenerator.generate(mockReceipt, mockOperationId);
        expect(result.success).toBe(false);
        expect(result.message).toContain('Failed to generate PDF');
    });

    it('should throw error if required font is missing', () => {
        // Mock the error when trying to access fonts
        vi.spyOn(fsPromises, 'access').mockRejectedValue(new Error('Missing Font'));
        vi.mocked(fsPromises.access).mockRejectedValue(new Error("Missing Font")) ;
        expect(() => (pdfGenerator as any)._checkRequiredFontsExist()).toThrowError();
        
    });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PdfGenerator } from '@/lib/services/pdfGenerator';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { format, parseISO } from 'date-fns';
import PDFDocument from 'pdfkit';
import { logger } from '@/lib/services/logging';
import { LineItem, Customer, SellerProfile, Receipt } from '@/lib/types';

vi.mock('fs');
vi.mock('path');
vi.mock('pdfkit');
vi.mock('date-fns');
vi.mock('@/lib/services/logging');

describe('PdfGenerator', () => {
    let pdfGenerator: PdfGenerator;
    const mockReceiptId = 'test-receipt';
    const mockOperationId = 'test-operation';
    const mockFilePath = '/mock/path/to/test-receipt.pdf';
    const mockPdfDir = '/mock/path/to/pdf-dir';
    const mockFontsDir = '/mock/path/to/fonts';

    beforeEach(() => {
        vi.clearAllMocks();
        pdfGenerator = new PdfGenerator();

        // Mock path.join
        vi.mocked(path.join).mockImplementation((...args) => {
            if (args.includes('receipt-pdfs')) {
                return mockPdfDir;
            }
            if (args.includes('fonts')) {
                return mockFontsDir;
            }
            return args.join('/');
        });

         // Mock fsPromises.mkdir
         vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);

        // Mock accessSync
         vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
        
        // Mock unlink
        vi.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);

          // Mock date-fns functions
          vi.mocked(format).mockImplementation((date) => `Formatted ${date}`);
          vi.mocked(parseISO).mockImplementation((dateString) => new Date(dateString));

         // Mock PDFDocument creation
        const mockPDFDocumentInstance = {
            pipe: vi.fn(),
            fontSize: vi.fn().mockReturnThis(),
            font: vi.fn().mockReturnThis(),
            text: vi.fn().mockReturnThis(),
            moveDown: vi.fn().mockReturnThis(),
            addPage: vi.fn().mockReturnThis(),
            heightOfString: vi.fn().mockReturnValue(10),
            y: 50,
            page:{margins: {left: 50, bottom: 50}, width: 612, height: 792},
            moveTo: vi.fn().mockReturnThis(),
            lineTo: vi.fn().mockReturnThis(),
            strokeColor: vi.fn().mockReturnThis(),
            stroke: vi.fn().mockReturnThis(),
            end: vi.fn(),
            on: vi.fn()
        };
       vi.mocked(PDFDocument).mockReturnValue(mockPDFDocumentInstance as any);

          // Mock logger
          vi.mocked(logger.info).mockImplementation(() => { });
          vi.mocked(logger.debug).mockImplementation(() => { });
          vi.mocked(logger.warn).mockImplementation(() => { });
          vi.mocked(logger.error).mockImplementation(() => { });

    });

    afterEach(() => {
       
    });

    it('should ensure PDF directory exists', async () => {
        await (pdfGenerator as any)._ensurePdfDirectoryExists();
        expect(fsPromises.mkdir).toHaveBeenCalledWith(mockPdfDir, { recursive: true });
    });

    it('should check if required fonts exist', () => {
         (pdfGenerator as any)._checkRequiredFontsExist();
         expect(fsPromises.access).toHaveBeenCalledTimes(2);
    });

    it('should initialize PDF document', () => {
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         expect(PDFDocument).toHaveBeenCalled();
    });

    it('should add header', () => {
          (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addHeader(true);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('TAX INVOICE', { align: 'center' });
    });

    it('should add seller info', () => {
        const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addSellerInfo(mockSeller);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('test seller');
    });

    it('should add customer info', () => {
        const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addCustomerInfo(mockCustomer);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith("test customer");
    });

    it('should add invoice details', () => {
        const mockDate = '2024-01-01';
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addInvoiceDetails(mockReceiptId, mockDate);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith(`Invoice ID: ${mockReceiptId}`);
         expect(format).toHaveBeenCalledWith(new Date(mockDate), 'dd/MM/yyyy');
    });

    it('should add line items', () => {
        const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addLineItemsTable(mockLineItems, false);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('Test Product', expect.anything(), expect.anything(), expect.anything());
    });

    it('should add totals', () => {
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         (pdfGenerator as any)._addTotals(100, 10, 110);
         expect(vi.mocked(PDFDocument).mock.results[0].value.text).toHaveBeenCalledWith('$110.00', expect.anything(), expect.anything(), expect.anything());
    });

    it('should finalize PDF', async () => {
         (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
         await (pdfGenerator as any)._setupStream();
         const stream = vi.mocked(PDFDocument).mock.results[0].value.pipe.mock.calls[0][0];
         stream.emit('finish');
         await (pdfGenerator as any)._finalize();
         expect(vi.mocked(PDFDocument).mock.results[0].value.end).toHaveBeenCalled();
    });

     it('should clean up failed PDF', async () => {
          (pdfGenerator as any)._filePath = mockFilePath;
        await (pdfGenerator as any)._cleanupFailedPdf();
        expect(fsPromises.unlink).toHaveBeenCalledWith(mockFilePath);
    });

    it('should generate PDF successfully', async () => {
       const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
        const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
        const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
        const mockReceipt: Receipt = {
            receipt_id: mockReceiptId, customer_id: 'test-customer', date_of_purchase: '2024-01-01', line_items: mockLineItems, subtotal_excl_GST: 100, GST_amount: 10, total_inc_GST: 110, is_tax_invoice: true, seller_profile_snapshot: mockSeller, customer_snapshot: mockCustomer
        };
         (pdfGenerator as any)._filePath = mockFilePath;
        const stream = vi.mocked(PDFDocument).mock.results[0].value.pipe.mock.calls[0][0];
        stream.emit('finish');
        const result = await pdfGenerator.generate(mockReceipt, mockOperationId);
        expect(result.success).toBe(true);
    });
   it('should handle concurrency', async () => {
    const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
    const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
    const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
    const mockReceipt: Receipt = {
        receipt_id: mockReceiptId, customer_id: 'test-customer', date_of_purchase: '2024-01-01', line_items: mockLineItems, subtotal_excl_GST: 100, GST_amount: 10, total_inc_GST: 110, is_tax_invoice: true, seller_profile_snapshot: mockSeller, customer_snapshot: mockCustomer
    };

    // First request
    const pdfGenerator1 = new PdfGenerator();
    const promise1 = pdfGenerator1.generate(mockReceipt, mockOperationId);

    // Second concurrent request
    const pdfGenerator2 = new PdfGenerator();
    const promise2 = pdfGenerator2.generate(mockReceipt, mockOperationId);

    // Ensure the second request fails
    const result2 = await promise2;
    expect(result2.success).toBe(false);
    expect(result2.message).toContain('Another PDF generation is currently in progress.');

    // Wait for the first request to complete and ensure it's successful
    const stream = vi.mocked(PDFDocument).mock.results[0].value.pipe.mock.calls[0][0];
    stream.emit('finish');
    const result1 = await promise1;
        expect(result1.success).toBe(true);
});

     it('should handle error during generation', async () => {
        const mockLineItems: LineItem[] = [{ product_name: 'Test Product', quantity: 1, unit_price: 10, line_total: 10, GST_applicable: false }];
        const mockCustomer: Omit<Customer, 'id'> = { customer_type: 'business', first_name: 'Test', last_name: 'Customer', business_name: "test customer", abn: '456', email: 'test@test.com', phone: '123', address: '1 test address' };
        const mockSeller: SellerProfile = { id: 'seller1', business_name: 'Test Seller', ABN_or_ACN: '123', contact_email: 'test@test.com', name: "test seller" };
        const mockReceipt: Receipt = {
            receipt_id: mockReceiptId, customer_id: 'test-customer', date_of_purchase: '2024-01-01', line_items: mockLineItems, subtotal_excl_GST: 100, GST_amount: 10, total_inc_GST: 110, is_tax_invoice: true, seller_profile_snapshot: mockSeller, customer_snapshot: mockCustomer
        };
         // Simulate an error by rejecting the stream setup
         vi.mocked(PDFDocument).mockImplementation(() => {
            throw new Error('Simulated PDF generation error');
        });
        const result = await pdfGenerator.generate(mockReceipt, mockOperationId);
        expect(result.success).toBe(false);
        expect(result.message).toContain('Failed to generate PDF');
    });

    it('should throw error if required font is missing', () => {
        // Mock the error when trying to access fonts
        vi.spyOn(fsPromises, 'access').mockRejectedValue(new Error('Missing Font'));
        vi.mocked(fsPromises.access).mockRejectedValue(new Error("Missing Font")) ;
        expect(() => (pdfGenerator as any)._checkRequiredFontsExist()).toThrowError();
        
    });
});