import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PuppeteerPdfGenerator } from '@/lib/services/puppeteerPdfGenerator';
import { IPdfGenerator, PdfGenerationResult } from './pdfGeneratorInterface';
import puppeteer from 'puppeteer';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { logger } from '@/lib/services/logging';
import { LineItem, Customer, SellerProfile, Receipt } from '@/lib/types';

// Mock external dependencies
vi.mock('puppeteer');
vi.mock('fs/promises');
vi.mock('path');
vi.mock('@/lib/services/logging');

describe('PuppeteerPdfGenerator', () => {
    let puppeteerPdfGenerator: PuppeteerPdfGenerator;
    const mockReceiptId = 'test-receipt-puppeteer';
    const mockOperationId = 'test-operation-puppeteer';
    const mockPdfDir = '/mock/path/to/pdf-dir';
    const mockFilePath = path.join(mockPdfDir, `${mockReceiptId}.pdf`);

    // Dummy Receipt Data (reused from pdfGenerator.test.ts structure)
    const mockLineItems: LineItem[] = [
        { product_id: 'p1', description: 'Desc 1', quantity: 2, unit_price: 10, line_total: 20, product_name: 'Test Product 1', GST_applicable: true },
        { product_id: 'p2', description: 'Desc 2', quantity: 1, unit_price: 50, line_total: 50, product_name: 'Test Product 2', GST_applicable: false },
    ];
    const mockCustomer: Customer = {
         id: 'cust-1',
        customer_type: 'business',
        first_name: 'Test',
        last_name: 'Contact',
        business_name: "Test Biz",
        abn: '456',
        email: 'biz@test.com',
        phone: '123',
        address: '1 Business Ave',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    const mockSeller: SellerProfile = {
        name: 'Test Seller Inc.',
        business_address: '123 Test St, Testville',
        ABN_or_ACN: '123 456 789',
        contact_email: 'info@testseller.com',
        contact_phone: '0400 123 456'
    };
    const mockReceipt: Receipt = {
        receipt_id: mockReceiptId,
        customer_id: mockCustomer.id,
        date_of_purchase: '2024-01-01T10:00:00.000Z',
        line_items: mockLineItems,
        subtotal_excl_GST: 60, // 2*10 (ex GST) + 1*50 (ex GST)
        GST_amount: 2, // 10% of 20 (from item 1)
        total_inc_GST: 62, // 60 + 2
        is_tax_invoice: true,
        seller_profile_snapshot: mockSeller,
        customer_snapshot: mockCustomer,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };


    // Mock Puppeteer methods
    const mockPage = {
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(undefined),
    };
    const mockedLaunch = vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser as any);

    // Mock fs/promises methods
    const mockedMkdir = vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);

     // Mock path.join
    vi.mocked(path.join).mockImplementation((...args) => {
        // Simple mock for joining paths for the PDF directory
        if (args.includes('receipt-pdfs')) {
             return path.posix.join('/mock/path/to/pdf-dir', ...args.slice(args.indexOf('receipt-pdfs') + 1));
        }
         return path.posix.join(...args);
     });


     beforeEach(() => {
        vi.clearAllMocks();
        puppeteerPdfGenerator = new PuppeteerPdfGenerator();

         // Mock logger functions
          vi.mocked(logger.info).mockImplementation(async () => {});
          vi.mocked(logger.debug).mockImplementation(async () => {});
          vi.mocked(logger.warn).mockImplementation(async () => {});
          vi.mocked(logger.error).mockImplementation(async () => {});
    });

    it('should generate PDF successfully with dummy data', async () => {
        const result = await puppeteerPdfGenerator.generate(mockReceipt, mockOperationId);

        expect(result.success).toBe(true);
        expect(result.filePath).toBe(mockFilePath);

        // Verify Puppeteer methods were called
        expect(mockedMkdir).toHaveBeenCalledWith(expect.stringContaining('receipt-pdfs'), { recursive: true });
        expect(mockedLaunch).toHaveBeenCalledWith({ headless: true });
        expect(mockBrowser.newPage).toHaveBeenCalledTimes(1);
        expect(mockPage.setContent).toHaveBeenCalledTimes(1);
        expect(mockPage.setContent).toHaveBeenCalledWith(expect.stringContaining(`<h1>Invoice</h1>`), { waitUntil: 'networkidle0' }); // Check for some expected HTML content
        expect(mockPage.pdf).toHaveBeenCalledTimes(1);
        expect(mockPage.pdf).toHaveBeenCalledWith({ path: mockFilePath, format: 'A4' });
        expect(mockPage.close).not.toHaveBeenCalled(); // Page close is not typically needed in this simple flow
        expect(mockBrowser.close).toHaveBeenCalledTimes(1); // Ensure browser is closed

        // Verify logging
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(mockOperationId), expect.stringContaining('Starting Puppeteer PDF generation...'));
         expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(mockOperationId), expect.stringContaining(`PDF generated successfully at: ${mockFilePath}`));
    });

     it('should handle errors during Puppeteer launch', async () => {
        const launchError = new Error('Failed to launch browser');
        mockedLaunch.mockRejectedValueOnce(launchError);

        const result = await puppeteerPdfGenerator.generate(mockReceipt, mockOperationId);

        expect(result.success).toBe(false);
        expect(result.message).toContain('PDF generation failed: Failed to launch browser');
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(mockOperationId), 'Error during Puppeteer PDF generation', launchError);

        // Ensure browser close is NOT called if launch fails
        expect(mockBrowser.close).not.toHaveBeenCalled();
    });

     it('should handle errors during page setContent', async () => {
        const contentError = new Error('Failed to set content');
        mockPage.setContent.mockRejectedValueOnce(contentError);

         const result = await puppeteerPdfGenerator.generate(mockReceipt, mockOperationId);

        expect(result.success).toBe(false);
        expect(result.message).toContain('PDF generation failed: Failed to set content');
         expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(mockOperationId), 'Error during Puppeteer PDF generation', contentError);

        // Ensure browser close is called even if setContent fails
        expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

     it('should handle errors during page pdf generation', async () => {
        const pdfError = new Error('Failed to generate PDF file');
        mockPage.pdf.mockRejectedValueOnce(pdfError);

         const result = await puppeteerPdfGenerator.generate(mockReceipt, mockOperationId);

        expect(result.success).toBe(false);
        expect(result.message).toContain('PDF generation failed: Failed to generate PDF file');
         expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(mockOperationId), 'Error during Puppeteer PDF generation', pdfError);

        // Ensure browser close is called even if pdf generation fails
        expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });
});