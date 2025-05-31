// Integration tests for PDF generation with template system
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PdfGenerator } from "@/lib/services/pdfGenerator";
import { DefaultReceiptTemplate } from "./pdfTemplates/DefaultReceiptTemplate";
import { IPdfReceiptTemplate } from "./pdfTemplates/IPdfReceiptTemplate";
import PDFDocument from "pdfkit";
import { logger } from "@/lib/services/logging";
import { Receipt, LineItem, Customer, SellerProfile } from "@/lib/types";
import stream from "stream";
import { promises as fsPromises, createWriteStream, WriteStream } from "fs";
import path from "path";

// Mock all external dependencies
vi.mock("fs");
vi.mock("path");
vi.mock("pdfkit");
vi.mock("@/lib/services/logging");

describe("PdfGenerator Integration Tests", () => {
  let pdfGenerator: PdfGenerator;
  let realTemplate: DefaultReceiptTemplate;
  let mockPDFDoc: any;
  let mockStream: stream.PassThrough;

  const createMockReceiptData = (overrides?: Partial<Receipt>): Receipt => ({
    receipt_id: "integration-test-123",
    customer_id: "cust-001",
    date_of_purchase: "2024-01-15T10:30:00.000Z",
    line_items: [
      {
        product_id: "p1",
        description: "Sourdough Bread",
        quantity: 2,
        unit_price: 6.50,
        line_total: 13.00,
        product_name: "Sourdough",
        GST_applicable: true,
      },
      {
        product_id: "p2", 
        description: "Croissant",
        quantity: 1,
        unit_price: 4.00,
        line_total: 4.00,
        product_name: "Croissant",
        GST_applicable: false,
      }
    ],
    subtotal_excl_GST: 17.00,
    GST_amount: 1.30,
    total_inc_GST: 18.30,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "The Corner Bakery",
      business_address: "123 Baker Street, Sydney NSW 2000",
      ABN_or_ACN: "12 345 678 901",
      contact_email: "orders@cornerbakery.com.au",
      phone: "02 9876 5432",
    },
    customer_snapshot: {
      id: "cust-001",
      customer_type: "individual" as const,
      first_name: "Sarah",
      last_name: "Johnson",
      email: "sarah.johnson@email.com",
      phone: "0412 345 678",
      address: "456 Customer Ave, Melbourne VIC 3000",
    },
    ...overrides
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock PDF document with all required methods
    mockPDFDoc = {
      pipe: vi.fn(),
      font: vi.fn().mockReturnThis(),
      fontSize: vi.fn().mockReturnThis(), 
      text: vi.fn().mockReturnThis(),
      moveDown: vi.fn().mockReturnThis(),
      addPage: vi.fn().mockReturnThis(),
      heightOfString: vi.fn().mockReturnValue(15),
      moveTo: vi.fn().mockReturnThis(),
      lineTo: vi.fn().mockReturnThis(),
      strokeColor: vi.fn().mockReturnThis(),
      stroke: vi.fn().mockReturnThis(),
      end: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      y: 50,
      page: {
        margins: { left: 50, bottom: 50, top: 50, right: 50 },
        width: 612,
        height: 792,
      }
    };

    // Mock PDFDocument constructor
    vi.mocked(PDFDocument).mockImplementation(() => mockPDFDoc);

    // Create real template instance (not mocked)
    realTemplate = new DefaultReceiptTemplate();

    // Create generator with real template
    pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);

    // Mock filesystem operations
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    
    // Create mock stream
    mockStream = new stream.PassThrough();
    vi.mocked(createWriteStream).mockReturnValue(mockStream as any);

    // Mock path operations
    vi.mocked(path.join).mockImplementation((...segments) => segments.join("/"));

    // Mock logger methods
    vi.mocked(logger.info).mockImplementation(async () => {});
    vi.mocked(logger.debug).mockImplementation(async () => {});
    vi.mocked(logger.warn).mockImplementation(async () => {});
    vi.mocked(logger.error).mockImplementation(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should generate a complete PDF with all sections", async () => {
    const receiptData = createMockReceiptData();
    
    // Simulate successful stream completion
    setTimeout(() => mockStream.emit("finish"), 10);

    const result = await pdfGenerator.generate(receiptData, "integration-complete");

    expect(result.success).toBe(true);
    expect(result.filePath).toContain("integration-test-123.pdf");

    // Verify PDF document was created and configured
    expect(vi.mocked(PDFDocument)).toHaveBeenCalledWith(
      expect.objectContaining({
        margin: expect.any(Number),
        bufferPages: true,
      })
    );

    // Verify document methods were called for content generation
    expect(mockPDFDoc.font).toHaveBeenCalled();
    expect(mockPDFDoc.fontSize).toHaveBeenCalled();
    expect(mockPDFDoc.text).toHaveBeenCalled();
    expect(mockPDFDoc.pipe).toHaveBeenCalledWith(mockStream);
    expect(mockPDFDoc.end).toHaveBeenCalled();
  });

  it("should handle tax invoice with GST correctly", async () => {
    const receiptData = createMockReceiptData({
      is_tax_invoice: true,
      GST_amount: 5.50,
    });

    setTimeout(() => mockStream.emit("finish"), 10);

    const result = await pdfGenerator.generate(receiptData, "tax-invoice-test");

    expect(result.success).toBe(true);
    
    // Verify text method was called with GST-related content
    const textCalls = mockPDFDoc.text.mock.calls;
    const hasGSTContent = textCalls.some((call: any[]) => 
      call[0] && call[0].toString().includes("GST")
    );
    expect(hasGSTContent).toBe(true);
  });

  it("should handle non-tax invoice without GST", async () => {
    const receiptData = createMockReceiptData({
      is_tax_invoice: false,
      GST_amount: 0,
    });

    setTimeout(() => mockStream.emit("finish"), 10);

    const result = await pdfGenerator.generate(receiptData, "non-tax-invoice-test");

    expect(result.success).toBe(true);

    // Verify document generation still succeeds without GST
    expect(mockPDFDoc.text).toHaveBeenCalled();
    expect(mockPDFDoc.end).toHaveBeenCalled();
  });

  it("should handle multiple line items with different GST status", async () => {
    const receiptData = createMockReceiptData({
      line_items: [
        {
          product_id: "p1",
          description: "GST Item",
          quantity: 1,
          unit_price: 10.00,
          line_total: 10.00,
          product_name: "GST Product",
          GST_applicable: true,
        },
        {
          product_id: "p2",
          description: "Non-GST Item", 
          quantity: 2,
          unit_price: 5.00,
          line_total: 10.00,
          product_name: "Non-GST Product",
          GST_applicable: false,
        }
      ]
    });

    setTimeout(() => mockStream.emit("finish"), 10);

    const result = await pdfGenerator.generate(receiptData, "mixed-gst-test");

    expect(result.success).toBe(true);
    
    // Verify table content was generated
    expect(mockPDFDoc.text).toHaveBeenCalledTimes(expect.any(Number));
  });

  it("should handle long customer information", async () => {
    const receiptData = createMockReceiptData({
      customer_snapshot: {
        id: "cust-long",
        customer_type: "business" as const,
        first_name: "Very Long Business Name That Might Wrap",
        last_name: "Incorporated Pty Ltd",
        email: "very.long.email.address@verylongdomainname.com.au",
        phone: "02 1234 5678",
        address: "Suite 123, Level 45, Very Long Street Name, Some Suburb, Some State 1234",
      }
    });

    setTimeout(() => mockStream.emit("finish"), 10);

    const result = await pdfGenerator.generate(receiptData, "long-info-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });

  it("should handle page breaks for many line items", async () => {
    // Create many line items to force page breaks
    const manyItems: LineItem[] = Array.from({ length: 50 }, (_, i) => ({
      product_id: `p${i}`,
      description: `Product ${i} with a reasonably long description`,
      quantity: i + 1,
      unit_price: (i + 1) * 2.50,
      line_total: (i + 1) * 2.50 * (i + 1),
      product_name: `Product ${i}`,
      GST_applicable: i % 2 === 0,
    }));

    const receiptData = createMockReceiptData({
      line_items: manyItems,
    });

    setTimeout(() => mockStream.emit("finish"), 10);

    const result = await pdfGenerator.generate(receiptData, "page-break-test");

    expect(result.success).toBe(true);
    
    // Verify addPage was called for page breaks
    expect(mockPDFDoc.addPage).toHaveBeenCalled();
  });

  it("should handle stream errors during PDF generation", async () => {
    const receiptData = createMockReceiptData();
    
    // Simulate stream error
    setTimeout(() => mockStream.emit("error", new Error("Stream write error")), 10);

    const result = await pdfGenerator.generate(receiptData, "stream-error-test");

    expect(result.success).toBe(false);
    expect(result.message).toContain("Stream write error");
  });

  it("should create PDF directory if it doesn't exist", async () => {
    const receiptData = createMockReceiptData();
    
    setTimeout(() => mockStream.emit("finish"), 10);

    await pdfGenerator.generate(receiptData, "mkdir-test");

    expect(vi.mocked(fsPromises.mkdir)).toHaveBeenCalledWith(
      expect.stringContaining("receipt-pdfs"),
      { recursive: true }
    );
  });

  it("should generate unique file paths for different receipts", async () => {
    const receipt1 = createMockReceiptData({ receipt_id: "receipt-001" });
    const receipt2 = createMockReceiptData({ receipt_id: "receipt-002" });
    
    setTimeout(() => mockStream.emit("finish"), 10);

    const result1 = await pdfGenerator.generate(receipt1, "unique-1");
    
    // Reset stream for second generation
    mockStream = new stream.PassThrough();
    vi.mocked(createWriteStream).mockReturnValue(mockStream as any);
    setTimeout(() => mockStream.emit("finish"), 10);
    
    const result2 = await pdfGenerator.generate(receipt2, "unique-2");

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.filePath).toContain("receipt-001.pdf");
    expect(result2.filePath).toContain("receipt-002.pdf");
    expect(result1.filePath).not.toEqual(result2.filePath);
  });

  it("should log appropriate messages during PDF generation", async () => {
    const receiptData = createMockReceiptData();
    
    setTimeout(() => mockStream.emit("finish"), 10);

    await pdfGenerator.generate(receiptData, "logging-test");

    // Verify logging calls
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringContaining("logging-test"),
      expect.stringContaining("Initializing PDF generation")
    );
    
    expect(vi.mocked(logger.debug)).toHaveBeenCalledWith(
      expect.stringContaining("logging-test"),
      expect.stringContaining("Adding content to PDF via template")
    );
    
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringContaining("logging-test"),
      expect.stringContaining("PDF generation successful")
    );
  });

  it("should handle date formatting correctly", async () => {
    const receiptData = createMockReceiptData({
      date_of_purchase: "2024-12-25T15:30:45.123Z"
    });
    
    setTimeout(() => mockStream.emit("finish"), 10);

    const result = await pdfGenerator.generate(receiptData, "date-format-test");

    expect(result.success).toBe(true);
    
    // Verify date was processed (exact format depends on template implementation)
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });
});
