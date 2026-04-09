import { describe, it, expect } from "bun:test";
import { generateReceiptHTML } from "../../src/lib/receipt-templates";
import { Receipt, LineItem } from "../../src/lib/types";

const mockSeller = {
  name: "Test Seller & Sons",
  business_address: "123 Seller St\nSeller City, SC 12345",
  ABN_or_ACN: "12 345 678 901",
  contact_email: "seller@test.com",
  phone: "0123456789",
};

const mockCustomerIndividual = {
  id: "cust-1",
  customer_type: "individual" as const,
  first_name: "John",
  last_name: "Doe",
  address: "456 Customer Ave\nCustomer City, CC 67890",
  email: "john@doe.com",
  phone: "9876543210",
};

const mockCustomerBusiness = {
  id: "cust-2",
  customer_type: "business" as const,
  business_name: "Test Business Corp",
  abn: "98 765 432 109",
  address: "789 Business Blvd\nBusiness City, BC 13579",
  email: "info@testbusiness.com",
  phone: "1112223333",
};

const mockLineItems: LineItem[] = [
  {
    product_id: "prod-1",
    product_name: "Test Product 1",
    description: "Description 1",
    quantity: 2,
    unit_price: 10.0,
    line_total: 20.0,
    GST_applicable: true,
  },
  {
    product_id: "prod-2",
    product_name: "Test Product 2",
    description: "Description 2",
    quantity: 1,
    unit_price: 15.5,
    line_total: 15.5,
    GST_applicable: false,
  },
];

const mockReceipt: Receipt = {
  receipt_id: "uuid-receipt-123456789012",
  customer_id: "cust-1",
  date_of_purchase: "2023-10-27T10:00:00",
  line_items: mockLineItems,
  subtotal_excl_GST: 32.27,
  GST_amount: 3.23,
  total_inc_GST: 35.5,
  is_tax_invoice: true,
  seller_profile_snapshot: mockSeller,
  customer_snapshot: mockCustomerIndividual,
};

describe("generateReceiptHTML", () => {
  it("should generate HTML for a tax invoice", () => {
    const html = generateReceiptHTML(mockReceipt);
    expect(html).toContain("<h1>Tax Invoice</h1>");
    expect(html).toContain("Test Seller &amp; Sons");
    expect(html).toContain("John Doe");
    expect(html).toContain("uuid-receipt");
    expect(html).toContain("27/10/2023");
    expect(html).toContain("Test Product 1");
    expect(html).toContain("Test Product 2");
    expect(html).toContain("$20.00");
    expect(html).toContain("$15.50");
    expect(html).toContain("$32.27");
    expect(html).toContain("$3.23");
    expect(html).toContain("$35.50");
    expect(html).toContain("12 345 678 901");
  });

  it("should generate HTML for a regular receipt", () => {
    const receipt = { ...mockReceipt, is_tax_invoice: false };
    const html = generateReceiptHTML(receipt);
    expect(html).toContain("<h1>Receipt</h1>");
  });

  it("should handle business customers correctly", () => {
    const receipt = { ...mockReceipt, customer_snapshot: mockCustomerBusiness };
    const html = generateReceiptHTML(receipt);
    expect(html).toContain("Test Business Corp");
    expect(html).toContain("ABN: 98 765 432 109");
  });

  it("should escape HTML in user-provided strings", () => {
    const maliciousSeller = { ...mockSeller, name: "<script>alert('xss')</script>" };
    const maliciousProduct = {
      product_id: "prod-1",
      product_name: "<b>Bold</b>",
      description: "Desc",
      quantity: 1,
      unit_price: 10,
      line_total: 10,
      GST_applicable: true,
    };
    const receipt = {
      ...mockReceipt,
      seller_profile_snapshot: maliciousSeller,
      line_items: [maliciousProduct],
    };
    const html = generateReceiptHTML(receipt);
    expect(html).toContain("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
  });

  it("should escape HTML in numeric fields if they contain malicious strings", () => {
    // Note: toFixed() will fail on strings, so we need to be careful how we test this
    // The current implementation calls .toFixed(2) on unit_price and line_total
    // and .toString() on quantity.
    // If they are actually numbers, escapeHTML is still good practice.
    // If they are somehow strings (e.g. from database corruption or bypass), they must be escaped.

    // Let's mock a case where they are strings but don't have toFixed called on them if they are not numbers?
    // Actually the code does:
    // <td>${escapeHTML(item.quantity.toString())}</td>
    // <td>$${escapeHTML(item.unit_price.toFixed(2))}</td>

    // To test this without causing runtime errors in the test itself (like unit_price.toFixed is not a function)
    // we can use objects that have toFixed/toString methods.

    const xss = "<script>alert('xss')</script>";
    const maliciousValue = {
      toFixed: () => xss,
      toString: () => xss,
    };

    const receiptWithXss = {
      ...mockReceipt,
      line_items: [
        {
          ...mockLineItems[0],
          quantity: maliciousValue as any,
          unit_price: maliciousValue as any,
          line_total: maliciousValue as any,
        },
      ],
      subtotal_excl_GST: maliciousValue as any,
      GST_amount: maliciousValue as any,
      total_inc_GST: maliciousValue as any,
    };

    const html = generateReceiptHTML(receiptWithXss as Receipt);
    expect(html).toContain("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    expect(html).not.toContain(xss);
  });

  it("should handle missing optional fields gracefully", () => {
    const minimalSeller = { ...mockSeller, phone: undefined };
    const minimalCustomer = {
      ...mockCustomerIndividual,
      phone: undefined,
      address: undefined,
      email: undefined,
    };
    const receipt = {
      ...mockReceipt,
      seller_profile_snapshot: minimalSeller,
      customer_snapshot: minimalCustomer,
    };
    const html = generateReceiptHTML(receipt);
    expect(html).not.toContain("Phone: <br>");
    expect(html).toContain("Email: seller@test.com");
    expect(html).toContain("<h3>Bill To</h3>");
    expect(html).not.toContain("Email: john@doe.com");
    expect(html).toContain("ABN: 12 345 678 901");
  });
});
