import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { PdfGenerator } from "@/lib/services/pdfGenerator";
import { DefaultReceiptTemplate } from "./pdfTemplates/DefaultReceiptTemplate";
import { IPdfReceiptTemplate } from "./pdfTemplates/IPdfReceiptTemplate";
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
vi.mock("./pdfTemplates/DefaultReceiptTemplate");

// Get correctly typed mocks for classes
const MockedPDFDocument = vi.mocked(PDFDocument, true);
const MockedDefaultReceiptTemplate = vi.mocked(DefaultReceiptTemplate, true);

describe("PdfGenerator", () => {
  let pdfGenerator: PdfGenerator;
  let mockTemplate: Mocked<IPdfReceiptTemplate>; // Use Mocked<Interface>

  const mockReceiptId = "test-receipt-123";
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a fresh mock for the template for each test
    // Ensure all methods of IPdfReceiptTemplate are mocked
    mockTemplate = {
      setDocument: vi.fn(),
      setLogPrefix: vi.fn(),
      addHeader: vi.fn(),
      addSellerInfo: vi.fn(),
      addCustomerInfo: vi.fn(),
      addInvoiceDetails: vi.fn(),
      addLineItemsTable: vi.fn(),
      addTotals: vi.fn(),
      doc: undefined as any, // Will be set by setDocument, can be initially undefined or a basic mock
      logPrefix: "",       // Will be set by setLogPrefix
    } as Mocked<IPdfReceiptTemplate>; // Cast the object to Mocked<IPdfReceiptTemplate>

    // Instantiate PdfGenerator with the mocked template
    pdfGenerator = new PdfGenerator(mockTemplate);

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

    // Setup mock for PDFDocument constructor using the correctly typed mock
    MockedPDFDocument.mockClear(); 
    MockedPDFDocument.mockImplementation(() => mockPDFDocumentInstance as any);

    // Reset mocks on the instance itself
    Object.values(mockPDFDocumentInstance).forEach((mockFn) => {
      if (typeof mockFn === "function" && "mockClear" in mockFn) {
        (mockFn as Mocked<typeof mockFn>).mockClear(); // Use Mocked<typeof Function>
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
    // Access private properties/methods via 'as any'
    (pdfGenerator as any)._logPrefix = "[test]"; // Set log prefix for the test
    await (pdfGenerator as any)._ensurePdfDirectoryExists();
    expect(mockedMkdir).toHaveBeenCalledWith(
      expect.stringContaining("receipt-pdfs"),
      { recursive: true },
    );
  });

  it("should initialize PDF document and pass it to the template", () => {
    (pdfGenerator as any)._initialize(mockReceiptId, mockOperationId);
    expect(MockedPDFDocument).toHaveBeenCalled(); // Check the typed mock
    const docInstance = (pdfGenerator as any)._doc;
    expect(docInstance).toBeDefined();
    expect((pdfGenerator as any)._filePath).toContain(`${mockReceiptId}.pdf`);
    expect(mockTemplate.setDocument).toHaveBeenCalledWith(docInstance);
    expect(mockTemplate.setLogPrefix).toHaveBeenCalledWith(expect.stringContaining(mockReceiptId));
  });

  it("should use default Helvetica fonts (indirectly via PDFDocument options)", async () => {
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

    // Check that PDFDocument was instantiated with default font (indirect assertion)
    expect(MockedPDFDocument).toHaveBeenCalledWith(expect.objectContaining({
      font: "Helvetica"
    }));
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

  it("should generate PDF successfully by calling template methods", async () => {
    const mockLineItems: LineItem[] = [
      {
        product_id: "p1",
        description: "Delicious Croissant",
        quantity: 2,
        unit_price: 3.50,
        line_total: 7.00,
        product_name: "Croissant",
        GST_applicable: true,
      },
      {
        product_id: "p2",
        description: "Fresh Baguette",
        quantity: 1,
        unit_price: 4.00,
        line_total: 4.00,
        product_name: "Baguette",
        GST_applicable: false, // Example of non-GST item
      },
    ];
    const mockCustomerSnapshot: Customer = {
      id: "cust-001",
      customer_type: "individual",
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
      phone: "0400123456",
      address: "123 Main St, Anytown",
    };
    const mockSellerProfileSnapshot: SellerProfile = {
      name: "The Bakehouse",
      business_address: "456 High St, Anytown",
      ABN_or_ACN: "12 345 678 901",
      contact_email: "sales@thebakehouse.com",
      phone: "0398765432",
    };
    const mockReceiptData: Receipt = {
      receipt_id: "receipt-abc-123",
      customer_id: "cust-001",
      date_of_purchase: "2024-05-15T10:30:00.000Z",
      line_items: mockLineItems,
      subtotal_excl_GST: 11.00, 
      GST_amount: 0.70, 
      total_inc_GST: 11.70,
      is_tax_invoice: true,
      seller_profile_snapshot: mockSellerProfileSnapshot,
      customer_snapshot: mockCustomerSnapshot,
    };

    // Mock the stream to emit 'finish'
    const mockStream = new stream.PassThrough();
    mockedCreateWriteStream.mockReturnValue(mockStream as any);
    setTimeout(() => mockStream.emit("finish"), 10); // Emit finish event

    const result = await pdfGenerator.generate(mockReceiptData, mockOperationId);

    expect(result.success).toBe(true);
    expect(result.filePath).toContain(`${mockReceiptData.receipt_id}.pdf`);
    expect(mockPDFDocumentInstance.pipe).toHaveBeenCalledWith(mockStream);
    expect(mockPDFDocumentInstance.end).toHaveBeenCalled();
    expect(MockedPDFDocument).toHaveBeenCalledTimes(1); // Check typed mock
    expect(mockedMkdir).toHaveBeenCalled();

    // Verify template methods were called with correct data
    expect(mockTemplate.addHeader).toHaveBeenCalledWith(mockReceiptData.is_tax_invoice);
    expect(mockTemplate.addSellerInfo).toHaveBeenCalledWith(mockReceiptData.seller_profile_snapshot);
    expect(mockTemplate.addCustomerInfo).toHaveBeenCalledWith(mockReceiptData.customer_snapshot);
    expect(mockTemplate.addInvoiceDetails).toHaveBeenCalledWith(mockReceiptData.receipt_id, mockReceiptData.date_of_purchase);
    expect(mockTemplate.addLineItemsTable).toHaveBeenCalledWith(mockReceiptData.line_items, mockReceiptData.GST_amount > 0);
    expect(mockTemplate.addTotals).toHaveBeenCalledWith(
      mockReceiptData.subtotal_excl_GST,
      mockReceiptData.GST_amount,
      mockReceiptData.total_inc_GST,
    );
  });

  it("should handle error during template processing and cleanup", async () => {
    const mockReceiptData: Receipt = {
      receipt_id: "err-receipt-456",
      customer_id: "cust-002",
      date_of_purchase: "2024-05-16T11:00:00.000Z",
      line_items: [{
        product_id: "p3",
        description: "Coffee",
        quantity: 1,
        unit_price: 5.00,
        line_total: 5.00,
        product_name: "Coffee",
        GST_applicable: true,
      }],
      subtotal_excl_GST: 5.00,
      GST_amount: 0.50,
      total_inc_GST: 5.50,
      is_tax_invoice: true,
      seller_profile_snapshot: { name: "S", business_address: "A", ABN_or_ACN: "1", contact_email: "e@m" },
      customer_snapshot: { id: "c1", customer_type: "individual", first_name: "F", last_name: "L" } as Customer,
    };

    // Simulate an error during one of the template methods
    const templateError = new Error("Simulated template error during addTotals");
    mockTemplate.addTotals.mockImplementation(() => {
      throw templateError;
    });

    // Mock stream and accessSync for cleanup check
    const mockStream = new stream.PassThrough();
    mockedCreateWriteStream.mockReturnValue(mockStream as any);
    mockedAccessSync.mockReturnValue(undefined); // Assume file exists for cleanup

    const result = await pdfGenerator.generate(mockReceiptData, mockOperationId);

    expect(result.success).toBe(false);
    // The message might be wrapped by PdfGenerator's own error handling
    expect(result.message).toContain("Simulated template error during addTotals"); 
    expect(mockedUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining(`${mockReceiptData.receipt_id}.pdf`),
    ); 
    expect((pdfGenerator as any)._doc).toBeNull(); 
    expect((pdfGenerator as any)._stream).toBeNull();
  });

  it("should handle initialization error", async () => {
    const initError = new Error("PDF Instantiation Failed");
    MockedPDFDocument.mockImplementation(() => { // Check typed mock
      throw initError;
    });
    const mockReceipt: Receipt = {
      /* minimal mock receipt */
    } as any;

    const result = await pdfGenerator.generate(mockReceipt, mockOperationId);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PDF initialization failed."); // This is the generic message from PdfGenerator
    expect(mockedCreateWriteStream).not.toHaveBeenCalled();
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });
});
