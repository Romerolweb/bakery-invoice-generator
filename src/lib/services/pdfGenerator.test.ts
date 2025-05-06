import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PdfGenerator } from "@/lib/services/pdfGenerator";
import {
  promises as fsPromises,
  createWriteStream,
  unlinkSync,
  accessSync,
} from "fs"; // Import sync versions too
import path from "path";
import { format, parseISO } from "date-fns";
import PDFDocument from "pdfkit";
import { logger } from "@/lib/services/logging";
import { LineItem, Customer, SellerProfile, Receipt } from "@/lib/types";
import stream from "stream";

// Mock the entire 'fs' module
vi.mock("fs", async (importOriginal) => {
  const originalFs = await importOriginal<typeof import("fs")>();
  return {
    ...originalFs, // Keep original exports
    promises: {
      // Mock promises API
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from("")), // Mock readFile as well if needed
      writeFile: vi.fn().mockResolvedValue(undefined), // Mock writeFile if needed
    },
    createWriteStream: vi.fn(() => {
      const mockStream = new stream.PassThrough();
      // Add mocked stream methods if needed, e.g., mockStream.on = vi.fn();
      // Ensure 'finish' and 'error' events can be emitted for testing
      setTimeout(() => mockStream.emit("finish"), 10); // Simulate finish event
      return mockStream as any; // Cast to any to satisfy WriteStream type
    }),
    // Mock sync functions needed
    accessSync: vi.fn().mockReturnValue(undefined), // Mock accessSync
    unlinkSync: vi.fn().mockResolvedValue(undefined), // Mock unlinkSync
  };
});

vi.mock("path");
vi.mock("pdfkit");
vi.mock("date-fns");
vi.mock("@/lib/services/logging");

describe("PdfGenerator", () => {
  let pdfGenerator: PdfGenerator;
  const mockReceiptId = "test-receipt";
  const mockOperationId = "test-operation";
  const mockFilePath = "/mock/path/to/test-receipt.pdf";
  const mockPdfDir = "/mock/path/to/pdf-dir";

  // Mock the fs methods we'll use
  const mockedMkdir = vi.mocked(fsPromises.mkdir);
  const mockedAccess = vi.mocked(fsPromises.access);
  const mockedUnlink = vi.mocked(fsPromises.unlink);
  const mockedCreateWriteStream = vi.mocked(createWriteStream);
  const mockedAccessSync = vi.mocked(accessSync);
  const mockedUnlinkSync = vi.mocked(unlinkSync);

  // Mock the PDFDocument instance methods
  const mockPDFDocumentInstance = {
    pipe: vi.fn(),
    fontSize: vi.fn().mockReturnThis(),
    font: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    moveDown: vi.fn().mockReturnThis(),
    addPage: vi.fn().mockReturnThis(),
    heightOfString: vi.fn().mockReturnValue(10),
    y: 50, // Simulate initial y position
    page: {
      margins: { left: 50, bottom: 50, top: 50, right: 50 },
      width: 612,
      height: 792,
    }, // Mock page dimensions and margins
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    strokeColor: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    end: vi.fn(),
    on: vi.fn(), // Mock the 'on' method
    once: vi.fn(), // Mock the 'once' method
  };
  // Explicitly type the mocked constructor return value
  const MockPDFDocument = PDFDocument as vi.MockedClass<typeof PDFDocument>;

  beforeEach(() => {
    vi.clearAllMocks();
    pdfGenerator = new PdfGenerator();

    // Mock path.join specifically for PDF directory
    vi.mocked(path.join).mockImplementation((...args) => {
      if (args.includes("receipt-pdfs")) {
        return path.posix.join(...args); // Use posix join for consistency
      }
      if (args.includes("receipts.json")) {
        // Example for other paths if needed
        return path.posix.join(
          process.cwd(),
          "src",
          "lib",
          "data",
          "receipts.json",
        );
      }
      return path.posix.join(...args); // Default posix join
    });

    // Setup mock for PDFDocument constructor
    MockPDFDocument.mockClear(); // Clear previous mock constructor calls
    MockPDFDocument.mockImplementation(() => mockPDFDocumentInstance as any);

    // Reset mocks on the instance itself
    Object.values(mockPDFDocumentInstance).forEach((mockFn) => {
      if (typeof mockFn === "function" && "mockClear" in mockFn) {
        (mockFn as vi.Mock).mockClear();
      }
    });
    mockPDFDocumentInstance.y = 50; // Reset mock y position

    // Mock logger functions
    vi.mocked(logger.info).mockImplementation(async () => {});
    vi.mocked(logger.debug).mockImplementation(async () => {});
    vi.mocked(logger.warn).mockImplementation(async () => {});
    vi.mocked(logger.error).mockImplementation(async () => {});
  });

  it("should ensure PDF directory exists", async () => {
    (pdfGenerator as any)._logPrefix = "[test]"; // Set log prefix for the test
    await (pdfGenerator as any)._ensurePdfDirectoryExists();
    expect(mockedMkdir).toHaveBeenCalledWith(
      expect.stringContaining("receipt-pdfs"),
      { recursive: true },
    );
  });

  it("should initialize PDF document", () => {
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    expect(MockPDFDocument).toHaveBeenCalled();
    expect((pdfGenerator as any)._doc).toBeDefined(); // Check if _doc is set
    expect((pdfGenerator as any)._filePath).toContain(`${mockReceiptId}.pdf`);
  });

  it("should add header", () => {
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    (pdfGenerator as any)._addHeader(true); // Test with Tax Invoice
    expect(mockPDFDocumentInstance.font).toHaveBeenCalledWith("Helvetica-Bold");
    expect(mockPDFDocumentInstance.fontSize).toHaveBeenCalledWith(20);
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("TAX INVOICE", {
      align: "center",
    });
    expect(mockPDFDocumentInstance.font).toHaveBeenCalledWith("Helvetica"); // Revert font
    expect(mockPDFDocumentInstance.fontSize).toHaveBeenCalledWith(10);
  });

  it("should add seller info", () => {
    const mockSeller: SellerProfile = {
      name: "Test Seller",
      business_address: "123 Test St",
      ABN_or_ACN: "123",
      contact_email: "test@test.com",
    };
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    (pdfGenerator as any)._addSellerInfo(mockSeller);
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("Test Seller");
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("123 Test St");
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("ABN/ACN: 123");
    // ... check other fields
  });

  it("should add customer info (business)", () => {
    const mockCustomer: Omit<Customer, "id"> = {
      customer_type: "business",
      first_name: "Test",
      last_name: "Contact",
      business_name: "Test Biz",
      abn: "456",
      email: "biz@test.com",
      phone: "123",
      address: "1 Business Ave",
    };
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    (pdfGenerator as any)._addCustomerInfo(mockCustomer);
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("Test Biz");
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("ABN: 456");
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "Contact: Test Contact",
    );
    // ... check other fields
  });

  it("should add customer info (individual)", () => {
    const mockCustomer: Omit<Customer, "id"> = {
      customer_type: "individual",
      first_name: "Indy",
      last_name: "Vid",
      email: "indy@test.com",
      phone: "456",
      address: "2 Person Ln",
    };
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    (pdfGenerator as any)._addCustomerInfo(mockCustomer);
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("Indy Vid");
    // ... check other fields
  });

  it("should add invoice details", () => {
    const mockDate = "2024-01-01T10:00:00.000Z"; // Use ISO string
    vi.mocked(parseISO).mockReturnValue(new Date(mockDate)); // Mock parseISO
    vi.mocked(format).mockReturnValue("01/01/2024"); // Mock format

    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    (pdfGenerator as any)._addInvoiceDetails(mockReceiptId, mockDate);
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `Invoice ID: ${mockReceiptId}`,
    );
    expect(parseISO).toHaveBeenCalledWith(mockDate);
    expect(format).toHaveBeenCalledWith(expect.any(Date), "dd/MM/yyyy"); // Ensure format is called with a Date
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `Date: 01/01/2024`,
    );
  });

  it("should add line items table (with GST)", () => {
    const mockLineItems: LineItem[] = [
      {
        product_id: "p1",
        description: "Desc 1",
        quantity: 2,
        unit_price: 10,
        line_total: 20,
        product_name: "Test Product 1",
        GST_applicable: true,
      },
    ];
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    mockPDFDocumentInstance.y = 150; // Simulate starting position
    (pdfGenerator as any)._addLineItemsTable(mockLineItems, true); // includeGstColumn = true

    // Check header drawing
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "Item",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ underline: true }),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "GST?",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ underline: true, align: "center" }),
    );
    // ... check other header columns

    // Check row drawing
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "Test Product 1",
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "Yes",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "center" }),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "2",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "right" }),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "$10.00",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "right" }),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "$20.00",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "right" }),
    );
  });

  it("should add line items table (without GST)", () => {
    const mockLineItems: LineItem[] = [
      {
        product_id: "p1",
        description: "Desc 1",
        quantity: 2,
        unit_price: 10,
        line_total: 20,
        product_name: "Test Product 1",
        GST_applicable: false,
      },
    ];
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    mockPDFDocumentInstance.y = 150; // Simulate starting position
    (pdfGenerator as any)._addLineItemsTable(mockLineItems, false); // includeGstColumn = false

    // Check header drawing - GST? column should be missing
    expect(mockPDFDocumentInstance.text).not.toHaveBeenCalledWith(
      "GST?",
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );

    // Check row drawing - GST? column should be missing
    expect(mockPDFDocumentInstance.text).not.toHaveBeenCalledWith(
      "Yes",
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).not.toHaveBeenCalledWith(
      "No",
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
  });

  it("should add totals (with GST)", () => {
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    mockPDFDocumentInstance.y = 200; // Simulate position after table
    (pdfGenerator as any)._addTotals(100, 10, 110);

    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `Subtotal (ex GST):`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `$100.00`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );

    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `GST Amount (10%):`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `$10.00`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );

    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `Total Amount:`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `$110.00`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
  });

  it("should add totals (without GST)", () => {
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    mockPDFDocumentInstance.y = 200; // Simulate position after table
    (pdfGenerator as any)._addTotals(100, 0, 100); // GST is 0

    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `Subtotal (ex GST):`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `$100.00`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );

    // GST Amount should NOT be displayed
    expect(mockPDFDocumentInstance.text).not.toHaveBeenCalledWith(
      `GST Amount (10%):`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );

    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `Total Amount:`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      `$100.00`,
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
  });

  it("should use default Helvetica fonts", async () => {
    const mockLineItems: LineItem[] = [
      {
        product_id: "p1",
        description: "Desc",
        quantity: 1,
        unit_price: 10,
        line_total: 10,
        product_name: "Test Product",
        GST_applicable: false,
      },
    ];
    const mockCustomer: Omit<Customer, "id"> = {
      customer_type: "individual",
      first_name: "Test",
      last_name: "Cust",
      email: "t@e.st",
    };
    const mockSeller: SellerProfile = {
      name: "Seller",
      business_address: "Addr",
      ABN_or_ACN: "123",
      contact_email: "s@e.st",
    };
    const mockReceipt: Receipt = {
      receipt_id: mockReceiptId,
      customer_id: "test-customer",
      date_of_purchase: "2024-01-01T00:00:00.000Z",
      line_items: mockLineItems,
      subtotal_excl_GST: 100,
      GST_amount: 10,
      total_inc_GST: 110,
      is_tax_invoice: true,
      seller_profile_snapshot: mockSeller,
      customer_snapshot: mockCustomer as Customer,
    };

    // Mock the stream to emit 'finish'
    const mockStream = new stream.PassThrough();
    mockedCreateWriteStream.mockReturnValue(mockStream as any);
    setTimeout(() => mockStream.emit("finish"), 10); // Emit finish event

    await pdfGenerator.generate(mockReceipt, mockOperationId);

    // Assert that font is called with the default fonts
    expect(mockPDFDocumentInstance.font).toHaveBeenCalledWith("Helvetica-Bold");
    expect(mockPDFDocumentInstance.font).toHaveBeenCalledWith("Helvetica");
  });

  it("should finalize PDF", async () => {
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    // Mock the stream setup
    const mockStream = new stream.PassThrough();
    mockedCreateWriteStream.mockReturnValue(mockStream as any);
    (pdfGenerator as any)._stream = mockStream;
    (pdfGenerator as any)._doc = mockPDFDocumentInstance as any; // Ensure doc is set

    // Use timers to simulate async behavior of stream events
    const finalizePromise = (pdfGenerator as any)._finalize();
    setTimeout(() => mockStream.emit("finish"), 10); // Emit finish after finalize is called

    await expect(finalizePromise).resolves.toBeUndefined();
    expect(mockPDFDocumentInstance.end).toHaveBeenCalled();
    expect((pdfGenerator as any)._success).toBe(true); // Check success flag
  });

  it("should handle stream error during finalize", async () => {
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    // Mock the stream setup
    const mockStream = new stream.PassThrough();
    mockedCreateWriteStream.mockReturnValue(mockStream as any);
    (pdfGenerator as any)._stream = mockStream;
    (pdfGenerator as any)._doc = mockPDFDocumentInstance as any; // Ensure doc is set

    // Use timers to simulate async behavior of stream events
    const finalizePromise = (pdfGenerator as any)._finalize();
    const testError = new Error("Stream write error");
    setTimeout(() => mockStream.emit("error", testError), 10); // Emit error

    await expect(finalizePromise).rejects.toThrow("Stream write error");
    expect(mockPDFDocumentInstance.end).toHaveBeenCalled();
    expect((pdfGenerator as any)._success).toBe(false); // Check success flag
  });

  it("should clean up failed PDF", async () => {
    (pdfGenerator as any)._filePath = mockFilePath;
    (pdfGenerator as any)._logPrefix = "[test]";

    // Mock stream state for cleanup
    const mockStream = new stream.PassThrough();
    (pdfGenerator as any)._stream = mockStream;

    // Mock accessSync to indicate file exists
    mockedAccessSync.mockReturnValue(undefined);

    await (pdfGenerator as any)._cleanupFailedPdf();

    expect(mockedUnlinkSync).toHaveBeenCalledWith(mockFilePath);
    expect((pdfGenerator as any)._doc).toBeNull();
    expect((pdfGenerator as any)._stream).toBeNull();
  });

  it("should not attempt unlink if file does not exist during cleanup", async () => {
    (pdfGenerator as any)._filePath = mockFilePath;
    (pdfGenerator as any)._logPrefix = "[test]";
    const mockStream = new stream.PassThrough();
    (pdfGenerator as any)._stream = mockStream;

    // Mock accessSync to throw ENOENT
    mockedAccessSync.mockImplementation(() => {
      const error = new Error("ENOENT: no such file or directory");
      (error as any).code = "ENOENT";
      throw error;
    });

    await (pdfGenerator as any)._cleanupFailedPdf();

    expect(mockedUnlinkSync).not.toHaveBeenCalled(); // Unlink should not be called
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(mockFilePath),
      expect.stringContaining("did not exist"),
    );
  });

  it("should generate PDF successfully", async () => {
    const mockLineItems: LineItem[] = [
      {
        product_id: "p1",
        description: "Desc",
        quantity: 1,
        unit_price: 10,
        line_total: 10,
        product_name: "Test Product",
        GST_applicable: false,
      },
    ];
    const mockCustomer: Omit<Customer, "id"> = {
      customer_type: "individual",
      first_name: "Test",
      last_name: "Cust",
      email: "t@e.st",
    };
    const mockSeller: SellerProfile = {
      name: "Seller",
      business_address: "Addr",
      ABN_or_ACN: "123",
      contact_email: "s@e.st",
    };
    const mockReceipt: Receipt = {
      receipt_id: mockReceiptId,
      customer_id: "test-customer",
      date_of_purchase: "2024-01-01T00:00:00.000Z",
      line_items: mockLineItems,
      subtotal_excl_GST: 100,
      GST_amount: 10,
      total_inc_GST: 110,
      is_tax_invoice: true,
      seller_profile_snapshot: mockSeller,
      customer_snapshot: mockCustomer as Customer, // Cast needed here
    };

    // Mock the stream to emit 'finish'
    const mockStream = new stream.PassThrough();
    mockedCreateWriteStream.mockReturnValue(mockStream as any);
    setTimeout(() => mockStream.emit("finish"), 10); // Emit finish event

    const result = await pdfGenerator.generate(mockReceipt, mockOperationId);

    expect(result.success).toBe(true);
    expect(result.filePath).toContain(`${mockReceiptId}.pdf`);
    expect(mockPDFDocumentInstance.pipe).toHaveBeenCalledWith(mockStream); // Ensure pipe was called
    expect(mockPDFDocumentInstance.end).toHaveBeenCalled(); // Ensure end was called
    expect(MockPDFDocument).toHaveBeenCalledTimes(1); // Ensure constructor called once
    expect(mockedMkdir).toHaveBeenCalled();
    // Add more checks for specific content additions if needed
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "TAX INVOICE",
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("Seller");
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith("Test Cust"); // Corrected to match mock data
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "Test Product",
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
    expect(mockPDFDocumentInstance.text).toHaveBeenCalledWith(
      "$110.00",
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
    );
  });

  it("should handle error during generation and cleanup", async () => {
    const mockLineItems: LineItem[] = [
      {
        product_id: "p1",
        description: "Desc",
        quantity: 1,
        unit_price: 10,
        line_total: 10,
        product_name: "Prod",
        GST_applicable: false,
      },
    ];
    const mockCustomer: Omit<Customer, "id"> = {
      customer_type: "individual",
      first_name: "T",
      last_name: "C",
      email: "e@m",
    };
    const mockSeller: SellerProfile = {
      name: "S",
      business_address: "A",
      ABN_or_ACN: "1",
      contact_email: "e@m",
    };
    const mockReceipt: Receipt = {
      receipt_id: mockReceiptId,
      customer_id: "cust1",
      date_of_purchase: "2024-01-01T00:00:00.000Z",
      line_items: mockLineItems,
      subtotal_excl_GST: 100,
      GST_amount: 10,
      total_inc_GST: 110,
      is_tax_invoice: true,
      seller_profile_snapshot: mockSeller,
      customer_snapshot: mockCustomer as Customer, // Cast needed
    };

    // Simulate an error during PDF content addition (e.g., in _addTotals)
    const testError = new Error("Simulated content error");
    mockPDFDocumentInstance.text.mockImplementation((text: string) => {
      if (text.startsWith("$110.00")) {
        // Simulate error when adding total
        throw testError;
      }
      return mockPDFDocumentInstance; // Return this for chaining
    });

    // Mock stream and accessSync for cleanup check
    const mockStream = new stream.PassThrough();
    mockedCreateWriteStream.mockReturnValue(mockStream as any);
    mockedAccessSync.mockReturnValue(undefined); // Assume file exists for cleanup

    const result = await pdfGenerator.generate(mockReceipt, mockOperationId);

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Failed to generate PDF: Simulated content error",
    );
    expect(mockedUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining(`${mockReceiptId}.pdf`),
    ); // Check cleanup happened
    expect((pdfGenerator as any)._doc).toBeNull(); // Check state reset
    expect((pdfGenerator as any)._stream).toBeNull();
  });

  it("should handle initialization error", async () => {
    // Simulate error during PDFDocument instantiation
    const initError = new Error("PDF Instantiation Failed");
    MockPDFDocument.mockImplementation(() => {
      throw initError;
    });
    const mockReceipt: Receipt = {
      /* minimal mock receipt */
    } as any;

    const result = await pdfGenerator.generate(mockReceipt, mockOperationId);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PDF initialization failed.");
    expect(mockedCreateWriteStream).not.toHaveBeenCalled(); // Stream setup shouldn't happen
    expect(mockedUnlinkSync).not.toHaveBeenCalled(); // Cleanup shouldn't happen if init fails badly
  });
});
