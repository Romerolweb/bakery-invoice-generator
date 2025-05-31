import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PdfGenerator } from "../src/lib/services/pdfGenerator";
import { DefaultReceiptTemplate } from "../src/lib/services/pdfTemplates/DefaultReceiptTemplate";
import { Receipt } from "../src/lib/types";
import * as fs from "fs";
import * as path from "path";

describe("PDF Generator Integration", () => {
  let pdfGenerator: PdfGenerator;
  let testOutputDir: string;
  
  const mockReceipt: Receipt = {
    receipt_id: `test-${Date.now()}`,
    customer_id: "cust-001",
    date_of_purchase: "2024-01-01T00:00:00.000Z",
    line_items: [{
      product_id: "p1",
      description: "Test Product",
      quantity: 2,
      unit_price: 15.50,
      line_total: 31.00,
      product_name: "Test Product",
      GST_applicable: true
    }],
    subtotal_excl_GST: 31.00,
    GST_amount: 3.10,
    total_inc_GST: 34.10,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "Test Integration Bakery",
      business_address: "456 Integration Ave",
      ABN_or_ACN: "987654321",
      contact_email: "integration@test.com"
    },
    customer_snapshot: {
      id: "integration-customer-001",
      customer_type: "individual",
      first_name: "Integration",
      last_name: "Test",
      email: "integration@customer.com"
    }
  };

  beforeEach(() => {
    pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
    testOutputDir = path.join(process.cwd(), "src", "lib", "data", "receipt-pdfs");
  });

  afterEach(() => {
    // Clean up test files
    const testFile = path.join(testOutputDir, `${mockReceipt.receipt_id}.pdf`);
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch (error) {
        console.warn(`Could not clean up test file: ${testFile}`);
      }
    }
  });

  it("should generate actual PDF file", async () => {
    const result = await pdfGenerator.generate(mockReceipt, "integration-test");
    
    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();
    
    if (result.filePath) {
      expect(fs.existsSync(result.filePath)).toBe(true);
      
      const stats = fs.statSync(result.filePath);
      expect(stats.size).toBeGreaterThan(1000); // PDF should have content
    }
  }, 10000); // 10 second timeout for file operations

  it("should create valid PDF structure", async () => {
    const result = await pdfGenerator.generate(mockReceipt, "structure-test");
    
    expect(result.success).toBe(true);
    
    if (result.filePath && fs.existsSync(result.filePath)) {
      const buffer = fs.readFileSync(result.filePath);
      const content = buffer.toString();
      
      // Basic PDF structure checks
      expect(content).toContain("%PDF-"); // PDF header
      expect(content).toContain("%%EOF"); // PDF footer
    }
  }, 10000);
});
