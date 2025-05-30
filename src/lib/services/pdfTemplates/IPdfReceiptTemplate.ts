import type PDFKit from "pdfkit";
import type { Customer, LineItem, SellerProfile } from "@/lib/types"; // Import necessary types

export interface IPdfReceiptTemplate {
  doc: PDFKit.PDFDocument;
  logPrefix: string;
  setDocument(doc: PDFKit.PDFDocument): void;
  setLogPrefix(logPrefix: string): void;
  addHeader(isTaxInvoice: boolean): void;
  addSellerInfo(seller: SellerProfile): void; // Use specific type
  addCustomerInfo(customer: Omit<Customer, "id">): void; // Use specific type, remove unused params
  addInvoiceInfo(invoiceId: string, dateOfPurchase: string): void; // New method for invoice ID and Date
  addItemsTable(items: LineItem[], includeGST: boolean): void; // Renamed, use specific type
  addTotals(subtotal: number, gstAmount: number, total: number, includeGST: boolean): void;
  addFooter(notes?: string): void;
}

// Define a constructor type for IPdfReceiptTemplate implementations
export type PdfReceiptTemplateConstructor = new (logPrefix?: string) => IPdfReceiptTemplate;
