import { expect, test, describe, vi, beforeEach } from "vitest";
import { createReceipt } from "@/lib/actions/receipts";

// Mock the dependencies
vi.mock("@/lib/data-access/receipts", () => ({
  createReceipt: vi.fn(),
}));
vi.mock("@/lib/data-access/products", () => ({
  getAllProducts: vi.fn(),
}));
vi.mock("@/lib/data-access/seller", () => ({
  getSellerProfile: vi.fn(),
}));
vi.mock("@/lib/data-access/customers", () => ({
  getCustomerById: vi.fn(),
}));
vi.mock("@/lib/services/logging", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("createReceipt Server Action - Input Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should return success: false and errors when input is invalid", async () => {
    const invalidData = {
      customer_id: "not-a-uuid",
      date_of_purchase: "invalid-date",
      line_items: [],
      include_gst: "not-a-boolean",
      force_tax_invoice: 123,
    } as any;

    const result = await createReceipt(invalidData);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Validation failed. Please check the fields.");
    expect(result.errors).toBeDefined();
    expect(result.errors?.customer_id).toContain("Invalid customer ID format");
    expect(result.errors?.date_of_purchase).toContain(
      "Invalid date format (YYYY-MM-DD)",
    );
    expect(result.errors?.line_items).toContain(
      "At least one line item is required",
    );
    expect(result.errors?.include_gst).toContain(
      "Expected boolean, received string",
    );
    expect(result.errors?.force_tax_invoice).toContain(
      "Expected boolean, received number",
    );
  });

  test("should return success: false when line item is invalid", async () => {
    const invalidData = {
      customer_id: "550e8400-e29b-41d4-a716-446655440000",
      date_of_purchase: "2023-10-27",
      line_items: [
        {
          product_id: "not-a-uuid",
          quantity: 0,
        },
      ],
      include_gst: true,
      force_tax_invoice: false,
    } as any;

    const result = await createReceipt(invalidData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    // Zod flatten().fieldErrors for nested arrays might be a bit different,
    // but it should still indicate an error.
    // Actually, .flatten().fieldErrors on the whole object will have line_items as an error entry.
  });
});
