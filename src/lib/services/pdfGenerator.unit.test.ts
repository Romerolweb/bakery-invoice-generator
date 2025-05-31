// Proper unit tests for PDF generation - Compatible with npm test
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PdfGenerator } from "./pdfGenerator";
import { DefaultReceiptTemplate } from "./pdfTemplates/DefaultReceiptTemplate";
import { Receipt } from "@/lib/types";
import { Readable } from "stream";

// Mock all external dependencies
vi.mock("pdfkit");
vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  createWriteStream: vi.fn(),
  accessSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("@/lib/services/logging", () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("PdfGenerator Unit Tests", () => {
  let pdfGenerator: PdfGenerator;
  let mockPDFDoc: any;
  let mockStream: any;

  const createMockReceiptData = (): Receipt => ({
    receipt_id: "test-receipt-001",
    customer_id: "cust-001",
    date_of_purchase: "2024-01-01T00:00:00.000Z",
    line_items: [{
      product_id: "p1",
      description: "Artisan Bread",
      quantity: 2,
      unit_price: 5.50,
      line_total: 11.00,
      product_name: "Artisan Bread",
      GST_applicable: true,
    }],
    subtotal_excl_GST: 10.00,
    GST_amount: 1.00,
    total_inc_GST: 11.00,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "Corner Bakery",
      business_address: "123 Main St, Sydney NSW 2000",
      ABN_or_ACN: "123456789",
      contact_email: "orders@cornerbakery.com",
      phone: "02 9876 5432",
    },
    customer_snapshot: {
      id: "cust-001",
      customer_type: "individual" as const,
      first_name: "John",
      last_name: "Smith",
      email: "john.smith@email.com",
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Create comprehensive mock PDF document
    mockPDFDoc = {
      pipe: vi.fn(),
      font: vi.fn().mockReturnThis(),
      fontSize: vi.fn().mockReturnThis(),
      text: vi.fn().mockReturnThis(),
      moveDown: vi.fn().mockReturnThis(),
      addPage: vi.fn().mockReturnThis(),
      end: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      y: 50,
      page: {
        margins: { left: 50, bottom: 50, top: 50, right: 50 },
        width: 612,
        height: 792,
      },
      moveTo: vi.fn().mockReturnThis(),
      lineTo: vi.fn().mockReturnThis(),
      strokeColor: vi.fn().mockReturnThis(),
      stroke: vi.fn().mockReturnThis(),
      heightOfString: vi.fn().mockReturnValue(15),
    };

    // Create mock stream that properly emits events
    mockStream = {
      on: vi.fn((event: string, callback: Function) => {
        if (event === "finish") {
          setTimeout(() => callback(), 10);
        }
        return mockStream;
      }),
      once: vi.fn((event: string, callback: Function) => {
        if (event === "finish") {
          setTimeout(() => callback(), 10);
        } else if (event === "close") {
          setTimeout(() => callback(), 5);
        }
        return mockStream;
      }),
      end: vi.fn(),
      closed: false,
      writable: true,
    };

    // Setup mocks
    const PDFDocument = require("pdfkit").default;
    vi.mocked(PDFDocument).mockImplementation(() => mockPDFDoc);
    
    const fs = require("fs");
    vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

    // Create PdfGenerator instance
    pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create PdfGenerator instance successfully", () => {
    expect(pdfGenerator).toBeDefined();
    expect(pdfGenerator).toBeInstanceOf(PdfGenerator);
  });

  it("should generate PDF successfully with valid receipt data", async () => {
    const receiptData = createMockReceiptData();
    
    const result = await pdfGenerator.generate(receiptData, "success-test");

    expect(result.success).toBe(true);
    expect(result.filePath).toContain("test-receipt-001.pdf");
    expect(mockPDFDoc.pipe).toHaveBeenCalledWith(mockStream);
    expect(mockPDFDoc.end).toHaveBeenCalled();
  });

  it("should handle font loading with fallback mechanism", async () => {
    // Mock font to fail on first call (Helvetica) but succeed on second (Courier)
    mockPDFDoc.font
      .mockImplementationOnce(() => {
        throw new Error("Font Helvetica not found");
      })
      .mockReturnThis();

    const receiptData = createMockReceiptData();
    const result = await pdfGenerator.generate(receiptData, "font-fallback-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.font).toHaveBeenCalledWith("Helvetica");
    expect(mockPDFDoc.font).toHaveBeenCalledWith("Courier");
  });

  it("should generate tax invoice correctly", async () => {
    const receiptData = createMockReceiptData();
    receiptData.is_tax_invoice = true;
    receiptData.GST_amount = 1.50;

    const result = await pdfGenerator.generate(receiptData, "tax-invoice-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });

  it("should generate non-tax invoice correctly", async () => {
    const receiptData = createMockReceiptData();
    receiptData.is_tax_invoice = false;
    receiptData.GST_amount = 0;

    const result = await pdfGenerator.generate(receiptData, "non-tax-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });

  it("should handle multiple line items correctly", async () => {
    const receiptData = createMockReceiptData();
    receiptData.line_items = [
      {
        product_id: "p1",
        description: "Croissant",
        quantity: 2,
        unit_price: 4.50,
        line_total: 9.00,
        product_name: "Croissant",
        GST_applicable: true,
      },
      {
        product_id: "p2",
        description: "Coffee",
        quantity: 1,
        unit_price: 5.00,
        line_total: 5.00,
        product_name: "Coffee",
        GST_applicable: true,
      }
    ];

    const result = await pdfGenerator.generate(receiptData, "multi-item-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });

  it("should handle PDFDocument initialization errors", async () => {
    const PDFDocument = require("pdfkit").default;
    vi.mocked(PDFDocument).mockImplementation(() => {
      throw new Error("PDFDocument initialization failed");
    });

    const receiptData = createMockReceiptData();
    const result = await pdfGenerator.generate(receiptData, "init-error-test");

    expect(result.success).toBe(false);
    expect(result.message).toContain("PDFDocument initialization failed");
  });

  it("should handle stream errors gracefully", async () => {
    mockStream.on = vi.fn((event: string, callback: Function) => {
      if (event === "error") {
        setTimeout(() => callback(new Error("Stream write error")), 10);
      }
      return mockStream;
    });

    const receiptData = createMockReceiptData();
    const result = await pdfGenerator.generate(receiptData, "stream-error-test");

    expect(result.success).toBe(false);
    expect(result.message).toContain("Stream write error");
  });

  it("should create PDF directory if it doesn't exist", async () => {
    const fs = require("fs");
    const receiptData = createMockReceiptData();
    
    await pdfGenerator.generate(receiptData, "mkdir-test");

    expect(fs.promises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("receipt-pdfs"),
      { recursive: true }
    );
  });

  it("should validate that all template methods are called", async () => {
    // Note: This test verifies the template interface is properly used
    const receiptData = createMockReceiptData();
    
    const result = await pdfGenerator.generate(receiptData, "template-methods-test");

    expect(result.success).toBe(true);
    // Template methods should be called through the template instance
    expect(mockPDFDoc.font).toHaveBeenCalled();
    expect(mockPDFDoc.fontSize).toHaveBeenCalled();
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });

  it("should handle customer data variations", async () => {
    const receiptData = createMockReceiptData();
    
    // Test business customer
    receiptData.customer_snapshot = {
      id: "biz-001",
      customer_type: "business" as const,
      business_name: "ABC Corp",
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@abccorp.com",
      abn: "12345678901",
    };

    const result = await pdfGenerator.generate(receiptData, "business-customer-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });
});
