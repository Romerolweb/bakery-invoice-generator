import type { Receipt, LineItem, Customer, SellerProfile } from "@/lib/types";
import type PDFDocument from "pdfkit"; // This is the class

export interface IPdfReceiptTemplate {
  doc: PDFKit.PDFDocument; // This is the type for an instance
  logPrefix: string; // For consistent logging

  setDocument(doc: PDFKit.PDFDocument): void;
  setLogPrefix(logPrefix: string): void;

  addHeader(isTaxInvoice: boolean): void;
  addSellerInfo(seller: SellerProfile): void;
  addCustomerInfo(customer: Omit<Customer, "id">): void;
  addInvoiceDetails(invoiceId: string, dateIsoString: string): void;
  addLineItemsTable(lineItems: LineItem[], includeGstColumn: boolean): void;
  addTotals(subtotal: number, gstAmount: number, total: number): void;
  // Potentially add methods for drawing table headers, footers, etc. if more granularity is needed
}
