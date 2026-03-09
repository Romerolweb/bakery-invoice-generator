import { expect, test, describe } from "vitest";
import { generateReceiptHTML } from "@/lib/receipt-templates";
import { Receipt } from "@/lib/types";

describe("Receipt XSS Protection", () => {
  const mockReceipt: Receipt = {
    receipt_id: "test-id-1234567890",
    customer_id: "customer-1",
    date_of_purchase: "2023-10-27T10:00:00Z",
    is_tax_invoice: true,
    subtotal_excl_GST: 100,
    GST_amount: 10,
    total_inc_GST: 110,
    seller_profile_snapshot: {
      name: "Seller <script>alert('xss')</script>",
      business_address: "123 Seller St\n<img src=x onerror=alert(1)>",
      ABN_or_ACN: "12 345 678 901",
      contact_email: "seller@example.com<svg/onload=alert(1)>",
      phone: "1234567890",
    },
    customer_snapshot: {
      id: "customer-1",
      customer_type: "individual" as const,
      first_name: "Customer <script>alert('xss')</script>",
      last_name: "Doe",
      address: "456 Customer Ave\n<iframe src=javascript:alert(1)></iframe>",
      email: "customer@example.com",
      phone: "1234567890",
      abn: "98765432109",
    },
    line_items: [
      {
        product_id: "p1",
        product_name: "Product <img src=x onerror=alert(1)>",
        description: "Test product",
        quantity: 1,
        unit_price: 100,
        line_total: 100,
        GST_applicable: true,
      },
    ],
  };

  test("should escape malicious strings in receipt HTML", () => {
    const html = generateReceiptHTML(mockReceipt);

    // Check seller name
    expect(html).not.toContain("Seller <script>alert('xss')</script>");
    expect(html).toContain("Seller &lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");

    // Check seller address
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");

    // Check customer name
    expect(html).not.toContain("Customer <script>alert('xss')</script>");
    expect(html).toContain("Customer &lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");

    // Check customer address
    expect(html).not.toContain("<iframe src=javascript:alert(1)></iframe>");
    expect(html).toContain("&lt;iframe src=javascript:alert(1)&gt;&lt;/iframe&gt;");

    // Check product name
    expect(html).not.toContain("Product <img src=x onerror=alert(1)>");
    expect(html).toContain("Product &lt;img src=x onerror=alert(1)&gt;");
  });
});
