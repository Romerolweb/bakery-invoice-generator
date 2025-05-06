import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createReceipt,
  getAllReceipts,
  getReceiptById,
} from "@/lib/actions/receipts";
import {
  createReceipt as createReceiptData,
  getAllReceipts as getAllReceiptsData,
  getReceiptById as getReceiptByIdData,
} from "@/lib/data-access/receipts";
import { getAllProducts } from "@/lib/data-access/products";
import { getSellerProfile } from "@/lib/data-access/seller";
import { getCustomerById } from "@/lib/data-access/customers";
import { Product, SellerProfile, Customer, Receipt } from "@/lib/types";
import {
  IPdfGenerator,
  PdfGenerationResult,
} from "@/lib/services/pdfGeneratorInterface"; // Import interface
import { PdfGenerator } from "@/lib/services/pdfGenerator"; // Import one implementation for mocking type
import { PuppeteerPdfGenerator } from "@/lib/services/puppeteerPdfGenerator"; // Import other implementation

// Mock the specific PDF generator implementations if needed, or mock the interface directly
vi.mock("@/lib/services/pdfGenerator");
vi.mock("@/lib/services/puppeteerPdfGenerator");

// Mock the data access functions
vi.mock("@/lib/data-access/receipts");
vi.mock("@/lib/data-access/products");
vi.mock("@/lib/data-access/seller");
vi.mock("@/lib/data-access/customers");
vi.mock("@/lib/services/logging"); // Mock logger
vi.mock("@/lib/recordChanges"); // Mock change recorder

// Mock the factory function or the classes directly depending on how getPdfGenerator is implemented
// Let's assume getPdfGenerator imports and decides based on ENV var. We can mock the classes.
const mockPdfKitGenerate = vi.fn<
  [Receipt, string],
  Promise<PdfGenerationResult>
>();
const mockPuppeteerGenerate = vi.fn<
  [Receipt, string],
  Promise<PdfGenerationResult>
>();

vi.mocked(PdfGenerator).mockImplementation(() => ({
  generate: mockPdfKitGenerate,
}));
vi.mocked(PuppeteerPdfGenerator).mockImplementation(() => ({
  generate: mockPuppeteerGenerate,
}));

describe("Receipt Actions", () => {
  const mockProducts: Product[] = [
    {
      id: "p1",
      name: "Product 1",
      unit_price: 10,
      GST_applicable: true,
      description: "Desc 1",
    },
  ];
  const mockSellerProfile: SellerProfile = {
    name: "Seller 1",
    business_address: "1 Seller St",
    ABN_or_ACN: "123456789",
    contact_email: "seller@test.com",
    phone: "111",
  };
  const mockCustomer: Customer = {
    id: "c1",
    customer_type: "business",
    first_name: "Cust",
    last_name: "Omer",
    business_name: "Customer 1 Biz",
    abn: "987654321",
    email: "cust@test.com",
    phone: "222",
    address: "1 Cust Rd",
  };
  const mockReceiptInputData = {
    customer_id: "c1",
    date_of_purchase: "2024-01-01",
    line_items: [{ product_id: "p1", quantity: 2 }],
    include_gst: true,
    force_tax_invoice: false,
  };
  const mockGeneratedReceipt: Receipt = {
    receipt_id: "test-receipt-id",
    customer_id: "c1",
    date_of_purchase: "2024-01-01",
    line_items: [
      {
        product_id: "p1",
        quantity: 2,
        unit_price: 10,
        line_total: 20,
        product_name: "Product 1",
        description: "Desc 1",
        GST_applicable: true,
      },
    ],
    subtotal_excl_GST: 20,
    GST_amount: 2,
    total_inc_GST: 22,
    is_tax_invoice: true, // Assuming total >= 82.50 or force_tax_invoice=true logic applies correctly
    seller_profile_snapshot: mockSellerProfile,
    customer_snapshot: mockCustomer,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default successful mocks
    vi.mocked(getAllProducts).mockResolvedValue(mockProducts);
    vi.mocked(getSellerProfile).mockResolvedValue(mockSellerProfile);
    vi.mocked(getCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(createReceiptData).mockImplementation(async (receipt) => receipt); // Return the input receipt on success
    mockPdfKitGenerate.mockResolvedValue({
      success: true,
      filePath: "/path/to/pdfkit.pdf",
    });
    mockPuppeteerGenerate.mockResolvedValue({
      success: true,
      filePath: "/path/to/puppeteer.pdf",
    });

    // Set default environment variable for testing (can override per test)
    process.env.PDF_GENERATOR = "pdfkit";
  });

  describe("createReceipt", () => {
    it("should successfully create a receipt and generate PDF using PDFKit (default)", async () => {
      process.env.PDF_GENERATOR = "pdfkit"; // Explicitly set for test clarity

      const result = await createReceipt(mockReceiptInputData);

      expect(result.success).toBe(true);
      expect(result.receipt?.receipt_id).toBeDefined();
      expect(result.pdfGenerated).toBe(true);
      expect(result.pdfPath).toEqual("/path/to/pdfkit.pdf");
      expect(result.pdfError).toBeUndefined();

      // Verify mocks
      expect(getAllProducts).toHaveBeenCalledTimes(1);
      expect(getSellerProfile).toHaveBeenCalledTimes(1);
      expect(getCustomerById).toHaveBeenCalledWith("c1");
      expect(createReceiptData).toHaveBeenCalledWith(
        expect.objectContaining({ customer_id: "c1" }),
      );
      expect(mockPdfKitGenerate).toHaveBeenCalledTimes(1);
      expect(mockPuppeteerGenerate).not.toHaveBeenCalled();
    });

    it("should successfully create a receipt and generate PDF using Puppeteer", async () => {
      process.env.PDF_GENERATOR = "puppeteer"; // Set to Puppeteer

      const result = await createReceipt(mockReceiptInputData);

      expect(result.success).toBe(true);
      expect(result.receipt?.receipt_id).toBeDefined();
      expect(result.pdfGenerated).toBe(true);
      expect(result.pdfPath).toEqual("/path/to/puppeteer.pdf");
      expect(result.pdfError).toBeUndefined();

      // Verify mocks
      expect(createReceiptData).toHaveBeenCalledTimes(1);
      expect(mockPuppeteerGenerate).toHaveBeenCalledTimes(1);
      expect(mockPdfKitGenerate).not.toHaveBeenCalled();
    });

    it("should fail if no products are found", async () => {
      vi.mocked(getAllProducts).mockResolvedValue([]);
      const result = await createReceipt(mockReceiptInputData);
      expect(result.success).toBe(false);
      expect(result.message).toContain("No products defined");
      expect(result.pdfGenerated).toBe(false);
      expect(createReceiptData).not.toHaveBeenCalled();
      expect(mockPdfKitGenerate).not.toHaveBeenCalled();
    });

    it("should fail if seller profile is not found", async () => {
      vi.mocked(getSellerProfile).mockResolvedValue(null);
      const result = await createReceipt(mockReceiptInputData);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Seller profile is not configured");
      expect(result.pdfGenerated).toBe(false);
      expect(createReceiptData).not.toHaveBeenCalled();
      expect(mockPdfKitGenerate).not.toHaveBeenCalled();
    });

    it("should fail if customer is not found", async () => {
      vi.mocked(getCustomerById).mockResolvedValue(null);
      const result = await createReceipt(mockReceiptInputData);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Customer with ID c1 not found");
      expect(result.pdfGenerated).toBe(false);
      expect(createReceiptData).not.toHaveBeenCalled();
      expect(mockPdfKitGenerate).not.toHaveBeenCalled();
    });

    it("should fail if a line item product is not found", async () => {
      const inputWithInvalidProduct = {
        ...mockReceiptInputData,
        line_items: [{ product_id: "invalid-p", quantity: 1 }],
      };
      const result = await createReceipt(inputWithInvalidProduct);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Product with ID invalid-p not found");
      expect(result.pdfGenerated).toBe(false);
      expect(createReceiptData).not.toHaveBeenCalled();
      expect(mockPdfKitGenerate).not.toHaveBeenCalled();
    });

    it("should return success but indicate PDF failure if generator fails", async () => {
      process.env.PDF_GENERATOR = "pdfkit";
      const pdfErrorMsg = "PDF generation failed internally";
      mockPdfKitGenerate.mockResolvedValue({
        success: false,
        message: pdfErrorMsg,
      });

      const result = await createReceipt(mockReceiptInputData);

      expect(result.success).toBe(true); // Data was saved
      expect(result.receipt?.receipt_id).toBeDefined();
      expect(result.pdfGenerated).toBe(false);
      expect(result.pdfPath).toBeUndefined();
      expect(result.pdfError).toEqual(pdfErrorMsg);

      // Verify mocks
      expect(createReceiptData).toHaveBeenCalledTimes(1);
      expect(mockPdfKitGenerate).toHaveBeenCalledTimes(1);
    });

    it("should return success but indicate PDF failure if generator throws error", async () => {
      process.env.PDF_GENERATOR = "pdfkit";
      const pdfErrorMsg = "Generator threw an exception";
      mockPdfKitGenerate.mockRejectedValue(new Error(pdfErrorMsg));

      const result = await createReceipt(mockReceiptInputData);

      expect(result.success).toBe(true); // Data was saved
      expect(result.receipt?.receipt_id).toBeDefined();
      expect(result.pdfGenerated).toBe(false);
      expect(result.pdfPath).toBeUndefined();
      expect(result.pdfError).toContain(pdfErrorMsg); // Message might be decorated

      // Verify mocks
      expect(createReceiptData).toHaveBeenCalledTimes(1);
      expect(mockPdfKitGenerate).toHaveBeenCalledTimes(1);
    });

    it("should fail if saving receipt data fails", async () => {
      vi.mocked(createReceiptData).mockResolvedValue(null); // Simulate save failure

      const result = await createReceipt(mockReceiptInputData);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to save invoice data");
      expect(result.pdfGenerated).toBe(false);
      expect(mockPdfKitGenerate).not.toHaveBeenCalled(); // PDF generation shouldn't be attempted
    });

    it("should calculate totals correctly (including GST)", async () => {
      const inputData = {
        customer_id: "c1",
        date_of_purchase: "2024-01-01",
        line_items: [
          { product_id: "p1", quantity: 2 }, // GST applicable, 10 * 2 = 20
          { product_id: "p2", quantity: 1 }, // GST not applicable, 5 * 1 = 5
        ],
        include_gst: true,
        force_tax_invoice: false,
      };
      const products = [
        {
          id: "p1",
          name: "Product 1",
          unit_price: 10,
          GST_applicable: true,
          description: "",
        },
        {
          id: "p2",
          name: "Product 2",
          unit_price: 5,
          GST_applicable: false,
          description: "",
        },
      ];
      vi.mocked(getAllProducts).mockResolvedValue(products);

      await createReceipt(inputData);

      expect(createReceiptData).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal_excl_GST: 25.0, // 20 + 5
          GST_amount: 2.0, // 10% of 20 (p1)
          total_inc_GST: 27.0, // 25 + 2
        }),
      );
    });

    it("should calculate totals correctly (excluding GST)", async () => {
      const inputData = {
        customer_id: "c1",
        date_of_purchase: "2024-01-01",
        line_items: [{ product_id: "p1", quantity: 3 }], // 10 * 3 = 30
        include_gst: false, // GST turned off
        force_tax_invoice: false,
      };
      vi.mocked(getAllProducts).mockResolvedValue(mockProducts); // p1 is GST applicable

      await createReceipt(inputData);

      expect(createReceiptData).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal_excl_GST: 30.0,
          GST_amount: 0.0, // Should be 0 as include_gst is false
          total_inc_GST: 30.0,
        }),
      );
    });
  });

  describe("getAllReceipts", () => {
    it("should successfully retrieve and sort receipts", async () => {
      const mockUnsortedReceipts: Receipt[] = [
        {
          receipt_id: "r2",
          date_of_purchase: "2023-01-01",
          customer_id: "c1",
          line_items: [],
          subtotal_excl_GST: 10,
          GST_amount: 1,
          total_inc_GST: 11,
          is_tax_invoice: false,
          seller_profile_snapshot: mockSellerProfile,
          customer_snapshot: mockCustomer,
        },
        {
          receipt_id: "r1",
          date_of_purchase: "2023-01-15",
          customer_id: "c2",
          line_items: [],
          subtotal_excl_GST: 20,
          GST_amount: 2,
          total_inc_GST: 22,
          is_tax_invoice: true,
          seller_profile_snapshot: mockSellerProfile,
          customer_snapshot: mockCustomer,
        },
      ];
      vi.mocked(getAllReceiptsData).mockResolvedValue(mockUnsortedReceipts);

      const result = await getAllReceipts();

      expect(result.length).toBe(2);
      expect(result[0].receipt_id).toBe("r1"); // Should be sorted descending by date
      expect(result[1].receipt_id).toBe("r2");
      expect(getAllReceiptsData).toHaveBeenCalledTimes(1);
    });

    it("should return an empty array when an error occurs during retrieval", async () => {
      vi.mocked(getAllReceiptsData).mockRejectedValue(new Error("DB error"));
      const result = await getAllReceipts();
      expect(result).toEqual([]);
    });
  });

  describe("getReceiptById", () => {
    it("should successfully retrieve a receipt by ID", async () => {
      const receiptId = "test-id";
      const mockReceipt = { ...mockGeneratedReceipt, receipt_id: receiptId }; // Use a defined receipt
      vi.mocked(getReceiptByIdData).mockResolvedValue(mockReceipt);

      const result = await getReceiptById(receiptId);

      expect(result).toEqual(mockReceipt);
      expect(getReceiptByIdData).toHaveBeenCalledWith(receiptId);
    });

    it("should return null when a receipt is not found", async () => {
      const receiptId = "not-found-id";
      vi.mocked(getReceiptByIdData).mockResolvedValue(null);
      const result = await getReceiptById(receiptId);
      expect(result).toBeNull();
    });

    it("should return null when an error occurs during retrieval", async () => {
      const receiptId = "error-id";
      vi.mocked(getReceiptByIdData).mockRejectedValue(new Error("DB error"));
      const result = await getReceiptById(receiptId);
      expect(result).toBeNull();
    });
  });

  // Clean up environment variables after tests
  afterEach(() => {
    delete process.env.PDF_GENERATOR;
  });
});
