// Integration test for PDF generation - tests real file creation
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PdfGenerator } from "./pdfGenerator";
import { DefaultReceiptTemplate } from "./pdfTemplates/DefaultReceiptTemplate";
import { Receipt } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";

describe("PdfGenerator Integration Tests", () => {
  const testDir = path.join(process.cwd(), "tmp", "test-pdfs");
  let originalPdfDir: string;

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Temporarily modify the PDF_DIR for testing
    const pdfGeneratorModule = await import("./pdfGenerator");
    originalPdfDir = (pdfGeneratorModule as any).PDF_DIR;
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  const createTestReceiptData = (): Receipt => ({
    receipt_id: "integration-test-001",
    customer_id: "cust-integration",
    date_of_purchase: "2024-01-15T10:30:00.000Z",
    line_items: [
      {
        product_id: "p1",
        description: "Sourdough Bread",
        quantity: 1,
        unit_price: 6.50,
        line_total: 6.50,
        product_name: "Sourdough Bread",
        GST_applicable: true,
      },
      {
        product_id: "p2", 
        description: "Butter Croissant",
        quantity: 2,
        unit_price: 4.00,
        line_total: 8.00,
        product_name: "Butter Croissant",
        GST_applicable: true,
      }
    ],
    subtotal_excl_GST: 14.50,
    GST_amount: 1.45,
    total_inc_GST: 15.95,
    is_tax_invoice: true,
    seller_profile_snapshot: {
      name: "Integration Test Bakery",
      business_address: "456 Test Avenue, Melbourne VIC 3000",
      ABN_or_ACN: "98 765 432 109",
      contact_email: "test@integrationbakery.com",
      phone: "03 9876 5432",
    },
    customer_snapshot: {
      id: "cust-integration",
      customer_type: "individual" as const,
      first_name: "Integration",
      last_name: "Tester",
      email: "integration.tester@example.com",
      phone: "0412 345 678",
      address: "789 Tester Street, Sydney NSW 2000",
    }
  });

  it("should create a real PDF file with valid content", async () => {
    const pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
    const receiptData = createTestReceiptData();
    
    const result = await pdfGenerator.generate(receiptData, "real-integration-test");
    
    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();
    
    if (result.filePath) {
      // Verify file exists
      const fileExists = await fs.access(result.filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Verify file has content
      const stats = await fs.stat(result.filePath);
      expect(stats.size).toBeGreaterThan(0);
      
      // Clean up created file
      await fs.unlink(result.filePath).catch(() => {
        // Ignore cleanup errors
      });
    }
  });

  it("should handle business customer data correctly", async () => {
    const pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
    const receiptData = createTestReceiptData();
    
    // Modify to business customer
    receiptData.customer_snapshot = {
      id: "biz-integration",
      customer_type: "business" as const,
      business_name: "Integration Test Corp Pty Ltd",
      first_name: "Business",
      last_name: "Contact",
      email: "business@integration.com",
      abn: "12 345 678 901",
      address: "100 Business Park, Brisbane QLD 4000",
    };
    
    const result = await pdfGenerator.generate(receiptData, "business-integration-test");
    
    expect(result.success).toBe(true);
    
    if (result.filePath) {
      const fileExists = await fs.access(result.filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Clean up
      await fs.unlink(result.filePath).catch(() => {});
    }
  });

  it("should handle non-tax invoice correctly", async () => {
    const pdfGenerator = new PdfGenerator(DefaultReceiptTemplate);
    const receiptData = createTestReceiptData();
    
    // Make it a non-tax invoice
    receiptData.is_tax_invoice = false;
    receiptData.GST_amount = 0;
    receiptData.total_inc_GST = receiptData.subtotal_excl_GST;
    
    const result = await pdfGenerator.generate(receiptData, "non-tax-integration-test");
    
    expect(result.success).toBe(true);
    
    if (result.filePath) {
      const fileExists = await fs.access(result.filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Clean up
      await fs.unlink(result.filePath).catch(() => {});
    }
  });
});
