import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { PdfGenerator } from "../src/lib/services/pdfGenerator";
import { DefaultReceiptTemplate } from "../src/lib/services/pdfTemplates/DefaultReceiptTemplate";
import type { Receipt } from "../src/lib/types";

describe("PDF Generator Integration Tests", () => {
  let pdfGenerator: PdfGenerator;
  const testOutputDir = "tmp/test-pdfs";
  
  const mockReceipt: Receipt = {
    receipt_id: "integration-test-001",
    customer_id: "cust-integration-001",
    date_of_purchase: "2024-01-01T00:00:00.000Z",
    line_items: [{
      product_id: "p1",
      description: "Integration Test Product",
      quantity: 2,
      unit_price: 15.00,
      line_total: 30.00,
      product_name: "Integration Test Product",
      GST_applicable: true
    }],
    subtotal_excl_GST: 30.00,
    GST_amount: 3.00,
    total_inc_GST: 33.00,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "Integration Test Bakery",
      business_address: "456 Integration Ave",
      ABN_or_ACN: "987654321",
      contact_email: "integration@test.com"
    },
    customer_snapshot: {
      id: "cust-integration-001",
      customer_type: "individual",
      first_name: "Integration",
      last_name: "Test",
      email: "integration@customer.com"
    }
  };

  beforeEach(() => {
    pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
    
    // Ensure test output directory exists
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testOutputDir)) {
      const files = fs.readdirSync(testOutputDir);
      files.forEach(file => {
        if (file.startsWith("integration-test-")) {
          try {
            fs.unlinkSync(path.join(testOutputDir, file));
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      });
    }
  });

  it("should create PDF generator instance", () => {
    expect(pdfGenerator).toBeDefined();
    expect(pdfGenerator).toBeInstanceOf(PdfGenerator);
  });

  it("should generate PDF file with proper structure", async () => {
    const result = await pdfGenerator.generate(mockReceipt, "integration-test-op-001");
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('message');
    
    if (result.success && result.filePath) {
      expect(fs.existsSync(result.filePath)).toBe(true);
      
      // Check file size is reasonable (not empty)
      const stats = fs.statSync(result.filePath);
      expect(stats.size).toBeGreaterThan(0);
    }
  }, 10000); // 10 second timeout for file operations
});
