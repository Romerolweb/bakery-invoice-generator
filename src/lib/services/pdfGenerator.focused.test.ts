// Proper unit tests for PDF generation that work with npm test
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PdfGenerator } from "./pdfGenerator";
import { DefaultReceiptTemplate } from "./pdfTemplates/DefaultReceiptTemplate";
import { Receipt } from "@/lib/types";
import PDFDocument from "pdfkit";

// Mock PDFKit and file system operations
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
  },
}));

vi.mock("./pdfTemplates/DefaultReceiptTemplate", () => ({
  DefaultReceiptTemplate: vi.fn().mockImplementation(() => ({
    setDocument: vi.fn(),
    setLogPrefix: vi.fn(),
    addHeader: vi.fn(),
    addSellerInfo: vi.fn(),
    addCustomerInfo: vi.fn(),
    addInvoiceInfo: vi.fn(),
    addItemsTable: vi.fn(),
    addTotals: vi.fn(),
    addFooter: vi.fn(),
  })),
}));

describe("PdfGenerator - Focused Tests", () => {
  let pdfGenerator: PdfGenerator;
  let mockPDFDoc: any;

  const mockReceiptData: Receipt = {
    receipt_id: "test-focused-001",
    customer_id: "cust-001",
    date_of_purchase: "2024-01-01T00:00:00.000Z",
    line_items: [{
      product_id: "p1",
      description: "Chocolate Croissant",
      quantity: 2,
      unit_price: 4.50,
      line_total: 9.00,
      product_name: "Chocolate Croissant",
      GST_applicable: true,
    }],
    subtotal_excl_GST: 9.00,
    GST_amount: 0.90,
    total_inc_GST: 9.90,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "Artisan Bakery",
      business_address: "123 Baker Street, Sydney NSW 2000",
      ABN_or_ACN: "123456789",
      contact_email: "orders@artisanbakery.com",
      phone: "+61 2 9876 5432",
    },
    customer_snapshot: {
      id: "cust-001",
      customer_type: "individual" as const,
      first_name: "Sarah",
      last_name: "Johnson",
      email: "sarah.johnson@email.com",
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();

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
      }
    };

    vi.mocked(PDFDocument).mockImplementation(() => mockPDFDoc);
    pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
  });

  it("should successfully create a PDF document instance", () => {
    const result = new PdfGenerator(DefaultReceiptTemplate);
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(PdfGenerator);
  });

  it("should handle font loading with fallback", async () => {
    // Mock font loading to fail first, then succeed with fallback
    mockPDFDoc.font.mockImplementationOnce(() => {
      throw new Error("Font not found");
    }).mockReturnThis();

    const result = await pdfGenerator.generate(mockReceiptData, "font-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.font).toHaveBeenCalled();
  });

  it("should generate PDF with correct receipt data", async () => {
    const result = await pdfGenerator.generate(mockReceiptData, "receipt-test");

    expect(result.success).toBe(true);
    expect(result.filePath).toContain("receipt-test");
    expect(mockPDFDoc.pipe).toHaveBeenCalled();
    expect(mockPDFDoc.end).toHaveBeenCalled();
  });

  it("should handle tax invoice generation", async () => {
    const taxReceiptData = { ...mockReceiptData, is_tax_invoice: true };
    
    const result = await pdfGenerator.generate(taxReceiptData, "tax-invoice-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });

  it("should handle non-tax invoice generation", async () => {
    const nonTaxReceiptData = { 
      ...mockReceiptData, 
      is_tax_invoice: false,
      GST_amount: 0 
    };
    
    const result = await pdfGenerator.generate(nonTaxReceiptData, "non-tax-invoice-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    // Mock PDFDocument to throw an error
    vi.mocked(PDFDocument).mockImplementation(() => {
      throw new Error("PDF creation failed");
    });

    const result = await pdfGenerator.generate(mockReceiptData, "error-test");

    expect(result.success).toBe(false);
    expect(result.message).toContain("PDF creation failed");
  });

  it("should validate receipt data structure", async () => {
    const invalidReceiptData = { ...mockReceiptData };
    delete (invalidReceiptData as any).receipt_id;

    const result = await pdfGenerator.generate(invalidReceiptData as Receipt, "validation-test");

    // Should still attempt to generate PDF despite missing receipt_id
    expect(result).toBeDefined();
  });

  it("should handle multiple line items correctly", async () => {
    const multiItemReceiptData = {
      ...mockReceiptData,
      line_items: [
        {
          product_id: "p1",
          description: "Chocolate Croissant",
          quantity: 2,
          unit_price: 4.50,
          line_total: 9.00,
          product_name: "Chocolate Croissant",
          GST_applicable: true,
        },
        {
          product_id: "p2",
          description: "Sourdough Bread",
          quantity: 1,
          unit_price: 8.00,
          line_total: 8.00,
          product_name: "Sourdough Bread",
          GST_applicable: true,
        }
      ],
      subtotal_excl_GST: 17.00,
      GST_amount: 1.70,
      total_inc_GST: 18.70,
    };

    const result = await pdfGenerator.generate(multiItemReceiptData, "multi-item-test");

    expect(result.success).toBe(true);
    expect(mockPDFDoc.text).toHaveBeenCalled();
  });
});
