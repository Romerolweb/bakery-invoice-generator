// Font loading and fallback testing for PDFKit PDF generation
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PdfGenerator } from "@/lib/services/pdfGenerator";
import { DefaultReceiptTemplate } from "./pdfTemplates/DefaultReceiptTemplate";
import PDFDocument from "pdfkit";
import { logger } from "@/lib/services/logging";
import { Receipt } from "@/lib/types";
import stream from "stream";
import { promises as fsPromises, createWriteStream } from "fs";

// Mock all dependencies
vi.mock("fs");
vi.mock("path");
vi.mock("pdfkit");
vi.mock("@/lib/services/logging");
vi.mock("./pdfTemplates/DefaultReceiptTemplate");

// Mock PDFDocument with font loading scenarios
const createMockPDFDocument = (shouldFailFont = false) => ({
  pipe: vi.fn(),
  font: vi.fn().mockImplementation((fontName: string) => {
    if (shouldFailFont && fontName === "Helvetica") {
      throw new Error(`ENOENT: no such file or directory, open 'node_modules/pdfkit/js/pdfkit.es.js [app-rsc] (ecmascript)/data/${fontName}.afm'`);
    }
    return this;
  }),
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
});

describe("PdfGenerator Font Loading", () => {
  let pdfGenerator: PdfGenerator;
  let mockTemplate: any;
  const mockReceiptData: Receipt = {
    receipt_id: "test-receipt-font",
    customer_id: "cust-001",
    date_of_purchase: "2024-01-01T00:00:00.000Z",
    line_items: [{
      product_id: "p1",
      description: "Test Product",
      quantity: 1,
      unit_price: 10.0,
      line_total: 10.0,
      product_name: "Test",
      GST_applicable: true,
    }],
    subtotal_excl_GST: 10.0,
    GST_amount: 1.0,
    total_inc_GST: 11.0,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "Test Bakery",
      business_address: "123 Test St",
      ABN_or_ACN: "123456789",
      contact_email: "test@bakery.com",
      phone: "1234567890",
    },
    customer_snapshot: {
      id: "cust-001",
      customer_type: "individual" as const,
      first_name: "Test",
      last_name: "Customer",
      email: "test@customer.com",
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock template
    mockTemplate = {
      setDocument: vi.fn(),
      setLogPrefix: vi.fn(),
      addHeader: vi.fn(),
      addSellerInfo: vi.fn(),
      addCustomerInfo: vi.fn(),
      addInvoiceInfo: vi.fn(),
      addItemsTable: vi.fn(),
      addTotals: vi.fn(),
      addFooter: vi.fn(),
      doc: undefined,
      logPrefix: "",
    };

    const MockTemplateConstructor = vi.fn().mockImplementation(() => mockTemplate);
    pdfGenerator = new PdfGenerator(MockTemplateConstructor);

    // Mock filesystem operations
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    
    // Mock createWriteStream with proper stream
    const mockStream = new stream.PassThrough();
    vi.mocked(createWriteStream).mockReturnValue(mockStream as any);
    setTimeout(() => mockStream.emit("finish"), 10);

    // Mock logger
    vi.mocked(logger.info).mockImplementation(async () => {});
    vi.mocked(logger.debug).mockImplementation(async () => {});
    vi.mocked(logger.warn).mockImplementation(async () => {});
    vi.mocked(logger.error).mockImplementation(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully use Courier font when Helvetica fails", async () => {
    // Mock PDFDocument to fail on Helvetica but succeed on Courier
    const mockDoc = createMockPDFDocument(true);
    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    const result = await pdfGenerator.generate(mockReceiptData, "test-operation");

    expect(result.success).toBe(true);
    expect(mockDoc.font).toHaveBeenCalledWith("Helvetica");
    expect(mockDoc.font).toHaveBeenCalledWith("Courier");
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("test-operation"),
      "Font Helvetica failed, falling back to Courier"
    );
  });

  it("should handle font loading gracefully in template methods", async () => {
    // Mock template that tries to use fonts
    mockTemplate.addHeader.mockImplementation(() => {
      // Simulate template trying to use fonts
      const doc = mockTemplate.doc;
      if (doc) {
        doc.font("Helvetica");
      }
    });

    const mockDoc = createMockPDFDocument(true);
    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    const result = await pdfGenerator.generate(mockReceiptData, "test-operation");

    expect(result.success).toBe(true);
    expect(mockTemplate.addHeader).toHaveBeenCalled();
  });

  it("should handle missing font files in Docker environment", async () => {
    // Simulate the specific Docker font error
    const dockerFontError = new Error("ENOENT: no such file or directory, open '[project]/node_modules/pdfkit/js/pdfkit.es.js [app-rsc] (ecmascript)/data/Helvetica.afm'");
    
    const mockDoc = {
      ...createMockPDFDocument(),
      font: vi.fn().mockImplementation((fontName: string) => {
        if (fontName === "Helvetica") {
          throw dockerFontError;
        }
        return mockDoc;
      })
    };

    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    const result = await pdfGenerator.generate(mockReceiptData, "docker-test");

    expect(result.success).toBe(true);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("docker-test"),
      "Font Helvetica failed, falling back to Courier"
    );
    expect(mockDoc.font).toHaveBeenCalledWith("Courier");
  });

  it("should initialize PDFDocument without font to avoid early font loading issues", async () => {
    const mockDoc = createMockPDFDocument();
    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    await pdfGenerator.generate(mockReceiptData, "init-test");

    // Verify PDFDocument is created without font in constructor
    expect(vi.mocked(PDFDocument)).toHaveBeenCalledWith(
      expect.objectContaining({
        margin: expect.any(Number),
        bufferPages: true,
        // Should NOT contain font property
      })
    );
    expect(vi.mocked(PDFDocument)).toHaveBeenCalledWith(
      expect.not.objectContaining({
        font: expect.anything()
      })
    );
  });

  it("should log font setting success when Helvetica works", async () => {
    const mockDoc = createMockPDFDocument(false); // No font failure
    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    await pdfGenerator.generate(mockReceiptData, "success-test");

    expect(mockDoc.font).toHaveBeenCalledWith("Helvetica");
    expect(vi.mocked(logger.debug)).toHaveBeenCalledWith(
      expect.stringContaining("success-test"),
      "Font Helvetica set successfully"
    );
  });

  it("should handle complete font system failure gracefully", async () => {
    // Mock both Helvetica and Courier failing
    const mockDoc = {
      ...createMockPDFDocument(),
      font: vi.fn().mockImplementation(() => {
        throw new Error("Complete font system failure");
      })
    };

    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    const result = await pdfGenerator.generate(mockReceiptData, "complete-failure-test");

    // Should still attempt generation even with font issues
    expect(result.success).toBe(true);
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it("should pass correct font constants to template", async () => {
    const mockDoc = createMockPDFDocument();
    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    await pdfGenerator.generate(mockReceiptData, "template-test");

    // Verify template receives the document with font capabilities
    expect(mockTemplate.setDocument).toHaveBeenCalledWith(mockDoc);
    expect(mockTemplate.setLogPrefix).toHaveBeenCalledWith(
      expect.stringContaining("template-test")
    );
  });

  it("should handle font loading in Alpine Linux environment", async () => {
    // Simulate Alpine Linux specific font issues
    const alpineFontError = new Error("Error: font not found");
    
    const mockDoc = {
      ...createMockPDFDocument(),
      font: vi.fn().mockImplementation((fontName: string) => {
        if (fontName === "Helvetica") {
          throw alpineFontError;
        }
        return mockDoc;
      })
    };

    vi.mocked(PDFDocument).mockImplementation(() => mockDoc as any);

    const result = await pdfGenerator.generate(mockReceiptData, "alpine-test");

    expect(result.success).toBe(true);
    expect(mockDoc.font).toHaveBeenCalledWith("Courier");
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("alpine-test"),
      "Font Helvetica failed, falling back to Courier"
    );
  });
});
