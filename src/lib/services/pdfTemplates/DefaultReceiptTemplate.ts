import type { Receipt, LineItem, Customer, SellerProfile } from "@/lib/types";
import type PDFDocument from "pdfkit"; // This is the class
import { IPdfReceiptTemplate } from "./IPdfReceiptTemplate";
import * as pdfStyles from "../pdfStyles";
import { logger } from "@/lib/services/logging";
import { format, parseISO } from "date-fns";

export class DefaultReceiptTemplate implements IPdfReceiptTemplate {
  doc: PDFKit.PDFDocument; // This is the type for an instance
  logPrefix: string = "[DefaultReceiptTemplate]"; // Default log prefix

  constructor(doc: PDFKit.PDFDocument, logPrefix?: string) { // Use the class instance type
    this.doc = doc;
    if (logPrefix) {
      this.logPrefix = logPrefix;
    }
  }

  setDocument(doc: PDFKit.PDFDocument): void { // Use the class instance type
    this.doc = doc;
  }

  setLogPrefix(logPrefix: string): void {
    this.logPrefix = logPrefix;
  }

  addHeader(isTaxInvoice: boolean): void {
    const funcPrefix = `${this.logPrefix}:addHeader`;
    logger.debug(funcPrefix, `Adding header. Is Tax Invoice: ${isTaxInvoice}`);
    this.doc
      .font(pdfStyles.FONT_BOLD)
      .fontSize(pdfStyles.HEADER_FONT_SIZE)
      .text(isTaxInvoice ? "TAX INVOICE" : "INVOICE", { align: "center" });
    this.doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    this.doc.moveDown();
  }

  addSellerInfo(seller: SellerProfile): void {
    const funcPrefix = `${this.logPrefix}:addSellerInfo`;
    logger.debug(funcPrefix, "Adding seller info");
    this.doc
      .font(pdfStyles.FONT_BOLD)
      .fontSize(pdfStyles.SECTION_LABEL_FONT_SIZE)
      .text("From:", { underline: false });
    this.doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    this.doc.text(seller.name || "Seller Name Missing");
    this.doc.text(seller.business_address || "Seller Address Missing");
    this.doc.text(`ABN/ACN: ${seller.ABN_or_ACN || "Seller ABN/ACN Missing"}`);
    this.doc.text(`Email: ${seller.contact_email || "Seller Email Missing"}`);
    if (seller.phone) {
      this.doc.text(`Phone: ${seller.phone}`);
    }
    this.doc.moveDown();
  }

  addCustomerInfo(customer: Omit<Customer, "id">): void {
    const funcPrefix = `${this.logPrefix}:addCustomerInfo`;
    logger.debug(funcPrefix, "Adding customer info");
    this.doc
      .font(pdfStyles.FONT_BOLD)
      .fontSize(pdfStyles.SECTION_LABEL_FONT_SIZE)
      .text("To:", { underline: false });
    this.doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    if (customer.customer_type === "business") {
      this.doc.text(customer.business_name || "Business Name Missing");
      if (customer.abn) {
        this.doc.text(`ABN: ${customer.abn}`);
      }
      const contactName =
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
      if (contactName) {
        this.doc.text(`Contact: ${contactName}`);
      }
    } else {
      const individualName =
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
      this.doc.text(individualName || "Customer Name Missing");
    }
    this.doc.text(`Email: ${customer.email || "N/A"}`);
    this.doc.text(`Phone: ${customer.phone || "N/A"}`);
    this.doc.text(`Address: ${customer.address || "N/A"}`);
    this.doc.moveDown();
  }

  addInvoiceDetails(invoiceId: string, dateIsoString: string): void {
    const funcPrefix = `${this.logPrefix}:addInvoiceDetails`;
    logger.debug(
      funcPrefix,
      `Adding invoice details ID: ${invoiceId}, Date: ${dateIsoString}`,
    );
    this.doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    this.doc.text(`Invoice ID: ${invoiceId}`);
    try {
      const dateObject = parseISO(dateIsoString);
      if (isNaN(dateObject.getTime())) {
        throw new Error("Invalid date object after parsing");
      }
      const formattedDate = format(dateObject, "dd/MM/yyyy");
      this.doc.text(`Date: ${formattedDate}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e : new Error(String(e));
      logger.warn(
        funcPrefix,
        `Could not parse or format date for PDF: ${dateIsoString}`,
        errorMessage,
      );
      this.doc.text(`Date: ${dateIsoString}`); // Fallback to ISO string
    }
    this.doc.moveDown(1.5);
  }

  private _drawTableHeader(includeGstColumn: boolean, y: number): void {
    const funcPrefix = `${this.logPrefix}:_drawTableHeader`;
    logger.debug(funcPrefix, `Drawing table header at Y=${y}`);
    const startX = this.doc.page.margins.left;
    const endX = this.doc.page.width - this.doc.page.margins.right;

    const itemCol = startX + pdfStyles.ITEM_COL_X_OFFSET;
    const gstCol = startX + pdfStyles.GST_COL_X_OFFSET;
    const qtyCol = startX + pdfStyles.QTY_COL_X_OFFSET;
    const priceCol = startX + pdfStyles.PRICE_COL_X_OFFSET;
    const totalCol = startX + pdfStyles.TOTAL_COL_X_OFFSET;

    const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
    const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
    const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;

    const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10;
    const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
    const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
    const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
    const totalWidth = endX - effectiveTotalCol;

    this.doc.font(pdfStyles.FONT_BOLD).fontSize(pdfStyles.TABLE_FONT_SIZE);
    this.doc.text("Item", itemCol, y, { width: itemWidth, underline: true });
    if (includeGstColumn)
      this.doc.text("GST?", gstCol, y, {
        width: gstWidth,
        underline: true,
        align: "center",
      });
    this.doc.text("Qty", effectiveQtyCol, y, {
      width: qtyWidth,
      underline: true,
      align: "right",
    });
    this.doc.text("Unit Price", effectivePriceCol, y, {
      width: priceWidth,
      underline: true,
      align: "right",
    });
    this.doc.text("Line Total", effectiveTotalCol, y, {
      width: totalWidth,
      underline: true,
      align: "right",
    });
    this.doc.moveDown(0.5);
    this.doc.font(pdfStyles.FONT_REGULAR);
  }

  addLineItemsTable(lineItems: LineItem[], includeGstColumn: boolean): void {
    const funcPrefix = `${this.logPrefix}:addLineItemsTable`;
    logger.debug(
      funcPrefix,
      `Adding ${lineItems.length} line items. Include GST Col: ${includeGstColumn}`,
    );
    const tableTopInitial = this.doc.y;
    const startX = this.doc.page.margins.left;
    const endX = this.doc.page.width - this.doc.page.margins.right;

    const itemCol = startX + pdfStyles.ITEM_COL_X_OFFSET;
    const gstCol = startX + pdfStyles.GST_COL_X_OFFSET;
    const qtyCol = startX + pdfStyles.QTY_COL_X_OFFSET;
    const priceCol = startX + pdfStyles.PRICE_COL_X_OFFSET;
    const totalCol = startX + pdfStyles.TOTAL_COL_X_OFFSET;

    const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
    const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
    const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;

    const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10;
    const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
    const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
    const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
    const totalWidth = endX - effectiveTotalCol;

    const pageBottom =
      this.doc.page.height - this.doc.page.margins.bottom - pdfStyles.TABLE_BOTTOM_MARGIN;

    this._drawTableHeader(includeGstColumn, tableTopInitial);
    let currentY = this.doc.y;

    lineItems.forEach((item, index) => {
      const itemHeightEstimate = this.doc.fontSize(pdfStyles.TABLE_FONT_SIZE).heightOfString("X") + 5;

      if (currentY + itemHeightEstimate > pageBottom) {
        logger.debug(
          funcPrefix,
          `Adding new page before item ${index + 1} at Y=${currentY}. Page bottom limit: ${pageBottom}`,
        );
        this.doc.addPage();
        currentY = this.doc.page.margins.top;
        this._drawTableHeader(includeGstColumn, currentY);
        currentY = this.doc.y;
      }

      const unitPriceExGST = item.unit_price ?? 0;
      const lineTotalExGST = item.line_total ?? 0;

      this.doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.TABLE_FONT_SIZE);
      const rowStartY = currentY;
      this.doc.text(item.product_name || "N/A", itemCol, rowStartY, {
        width: itemWidth,
      });

      const actualHeight = this.doc.fontSize(pdfStyles.TABLE_FONT_SIZE).heightOfString(
        item.product_name || "N/A",
        { width: itemWidth },
      );
      const rightColumnsY = rowStartY;

      if (includeGstColumn)
        this.doc.text(
          item.GST_applicable ? "Yes" : "No",
          gstCol,
          rightColumnsY,
          { width: gstWidth, align: "center" },
        );
      this.doc.text(
        item.quantity?.toString() ?? "0",
        effectiveQtyCol,
        rightColumnsY,
        { width: qtyWidth, align: "right" },
      );
      this.doc.text(
        `$${unitPriceExGST.toFixed(2)}`,
        effectivePriceCol,
        rightColumnsY,
        { width: priceWidth, align: "right" },
      );
      this.doc.text(
        `$${lineTotalExGST.toFixed(2)}`,
        effectiveTotalCol,
        rightColumnsY,
        { width: totalWidth, align: "right" },
      );

      currentY = rowStartY + actualHeight + 3;
      this.doc.y = currentY;
    });

    this.doc.moveDown(0.5);

    logger.debug(
      funcPrefix,
      `Drawing separator line before totals at Y=${this.doc.y}`,
    );
    this.doc.moveTo(startX, this.doc.y)
      .lineTo(endX, this.doc.y)
      .strokeColor(pdfStyles.COLOR_GREY_LIGHT)
      .stroke();
    this.doc.moveDown(0.5);
  }

  addTotals(subtotal: number, gstAmount: number, total: number): void {
    const funcPrefix = `${this.logPrefix}:addTotals`;
    logger.debug(
      funcPrefix,
      `Adding totals: Sub=${subtotal}, GST=${gstAmount}, Total=${total}`,
    );
    const totalsX = this.doc.page.width - this.doc.page.margins.right - 150;
    const labelX = this.doc.page.margins.left;
    const endX = this.doc.page.width - this.doc.page.margins.right;
    let totalsY = this.doc.y;

    const pageBottom =
      this.doc.page.height - this.doc.page.margins.bottom - 20;
    
    if (totalsY + pdfStyles.TOTALS_SECTION_HEIGHT_ESTIMATE > pageBottom) {
      logger.debug(
        funcPrefix,
        `Adding new page before totals section at Y=${totalsY}. Page bottom limit: ${pageBottom}`,
      );
      this.doc.addPage();
      totalsY = this.doc.page.margins.top;
      this.doc.y = totalsY;
    }

    this.doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.TOTALS_FONT_SIZE);
    const amountWidth = endX - totalsX;

    this.doc.text(`Subtotal (ex GST):`, labelX, totalsY, {
      align: "left",
    });
    this.doc.text(`$${subtotal.toFixed(2)}`, totalsX, totalsY, {
      align: "right",
      width: amountWidth,
    });
    totalsY = this.doc.y + 2;

    if (gstAmount > 0) {
      this.doc.text(`GST Amount (10%):`, labelX, totalsY, {
        align: "left",
      });
      this.doc.text(`$${gstAmount.toFixed(2)}`, totalsX, totalsY, {
        align: "right",
        width: amountWidth,
      });
      totalsY = this.doc.y + 2;
    }

    const lineY = totalsY + 5;
    logger.debug(funcPrefix, `Drawing separator line for totals at Y=${lineY}`);
    this.doc
      .moveTo(totalsX - 20, lineY)
      .lineTo(endX, lineY)
      .strokeColor(pdfStyles.COLOR_GREY_MEDIUM)
      .stroke();
    totalsY = lineY + 5;
    this.doc.y = totalsY;

    this.doc.font(pdfStyles.FONT_BOLD).fontSize(pdfStyles.TOTALS_TOTAL_FONT_SIZE);
    this.doc.text(`Total Amount:`, labelX, totalsY, {
      align: "left",
    });
    this.doc.text(`$${total.toFixed(2)}`, totalsX, totalsY, {
      align: "right",
      width: amountWidth,
    });
    totalsY = this.doc.y;

    this.doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    this.doc.y = totalsY;
    this.doc.moveDown();
  }
}
