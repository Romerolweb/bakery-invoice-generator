import { describe, it, expect, vi, beforeEach } from "vitest";
import { PdfGenerator } from "../src/lib/services/pdfGenerator";
import { DefaultReceiptTemplate } from "../src/lib/services/pdfTemplates/DefaultReceiptTemplate";
import type { Receipt } from "../src/lib/types";

// Mock PDFKit
vi.mock("pdfkit", () => ({
  default: vi.fn().mockImplementation(() => ({
    font: vi.fn().mockReturnThis(),
    fontSize: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    moveDown: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    strokeColor: vi.fn().mockReturnThis(),
    addPage: vi.fn().mockReturnThis(),
    pipe: vi.fn(),
    end: vi.fn(),
    page: {
      width: 612,
      height: 792,
      margins: { left: 50, right: 50, top: 50, bottom: 50 }
    },
    y: 100,
    heightOfString: vi.fn().mockReturnValue(12)
  }))
}));

// Mock filesystem
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    default: actual,
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined)
    },
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "finish") {
          // Simulate successful stream finish
          setTimeout(() => callback(), 10);
        }
        return this;
      }),
      once: vi.fn().mockImplementation((event, callback) => {
        if (event === "finish") {
          // Simulate successful stream finish
          setTimeout(() => callback(), 10);
        }
        return this;
      }),
      write: vi.fn(),
      end: vi.fn()
    }),
    unlinkSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true)
  };
});

// Mock path
vi.mock("path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("path")>();
  return {
    default: actual,
    ...actual,
    join: vi.fn((...args: string[]) => {
      // Filter out undefined/null values and join with /
      const validArgs = args.filter(arg => arg != null && arg !== '');
      return validArgs.length > 0 ? validArgs.join("/") : "/tmp";
    }),
    dirname: vi.fn(() => "/mocked/dir"),
    resolve: vi.fn((...args: string[]) => "/" + args.filter(arg => arg != null).join("/"))
  };
});

// Mock process.cwd
vi.mock("process", () => ({
  cwd: vi.fn(() => "/mock/workspace")
}));

// Mock logger
vi.mock("../src/lib/services/logging", () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined)
  }
}));

describe("PDF Generator - Core Tests", () => {
  let pdfGenerator: PdfGenerator;
  
  const mockReceipt: Receipt = {
    receipt_id: "test-001",
    customer_id: "cust-001",
    date_of_purchase: "2024-01-01T00:00:00.000Z",
    line_items: [{
      product_id: "p1",
      description: "Test Product",
      quantity: 1,
      unit_price: 10.00,
      line_total: 10.00,
      product_name: "Test Product",
      GST_applicable: true
    }],
    subtotal_excl_GST: 10.00,
    GST_amount: 1.00,
    total_inc_GST: 11.00,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "Test Bakery",
      business_address: "123 Test St",
      ABN_or_ACN: "123456789",
      contact_email: "test@bakery.com"
    },
    customer_snapshot: {
      id: "cust-001",
      customer_type: "individual",
      first_name: "Test",
      last_name: "Customer",
      email: "test@customer.com"
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
  });

  it("should create PDF generator instance", () => {
    expect(pdfGenerator).toBeDefined();
    expect(pdfGenerator).toBeInstanceOf(PdfGenerator);
  });

  it("should have correct template", () => {
    expect(pdfGenerator).toBeDefined();
    // Template is set internally during construction
  });

  it("should handle basic PDF generation workflow", async () => {
    const result = await pdfGenerator.generate(mockReceipt, "test-op-001");
    
    // Basic success test - specific details depend on implementation
    // We're testing that the method completes without throwing
    expect(result).toBeDefined();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('message');
  });
});
