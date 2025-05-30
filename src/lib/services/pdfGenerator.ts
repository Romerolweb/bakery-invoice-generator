// src/lib/services/pdfGenerator.ts
import type { Receipt, LineItem, Customer, SellerProfile } from "@/lib/types";
import { IPdfGenerator, PdfGenerationResult } from "./pdfGeneratorInterface";
import {
  promises as fsPromises,
  createWriteStream,
  WriteStream,
  accessSync,
  unlinkSync,
} from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { format, parseISO } from "date-fns";
import { logger } from "@/lib/services/logging";
import * as pdfStyles from "./pdfStyles"; // Import styles

const DATA_DIR = path.join(process.cwd(), "src", "lib", "data");
const PDF_DIR = path.join(DATA_DIR, "receipt-pdfs"); // Directory to store generated PDFs

export class PdfGenerator implements IPdfGenerator {
  private _doc: PDFKit.PDFDocument | null = null;
  private _stream: WriteStream | null = null;
  private _filePath: string = "";
  private _logPrefix: string = "";
  private _success: boolean = false;
  private _operationId: string = ""; // To correlate logs

  // Ensure the PDF directory exists
  private async _ensurePdfDirectoryExists(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_ensurePdfDirectoryExists`;
    try {
      await fsPromises.mkdir(PDF_DIR, { recursive: true });
      await logger.debug(funcPrefix, `PDF directory ensured: ${PDF_DIR}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error : new Error(String(error));
      await logger.error(
        funcPrefix,
        "FATAL: Error creating PDF directory",
        errorMessage,
      );
      throw new Error(
        `Failed to ensure PDF directory exists: ${errorMessage.message}`,
      );
    }
  }

  private _initialize(receiptId: string, operationId: string): void {
    this._operationId = operationId;
    this._logPrefix = `[${operationId} PDFKit ${receiptId}]`; // Indicate PDFKit
    this._filePath = path.join(PDF_DIR, `${receiptId}.pdf`);
    logger.info(
      this._logPrefix,
      `Initializing PDF generation for path: ${this._filePath}`,
    );
    try {
      this._doc = new PDFDocument({
        margin: pdfStyles.PAGE_MARGIN,
        bufferPages: true,
        font: pdfStyles.FONT_REGULAR,
      });
      logger.debug(this._logPrefix, `PDFDocument instantiated successfully.`);
    } catch (instantiationError) {
      const errorMessage = instantiationError instanceof Error ? instantiationError : new Error(String(instantiationError));
      logger.error(
        this._logPrefix,
        `FATAL: Error instantiating PDFDocument`,
        errorMessage,
      );
      throw new Error(
        `PDF library initialization error: ${errorMessage.message}`,
      );
    }
    this._success = false; // Reset success flag
  }

  private async _setupStream(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_setupStream`;
    return new Promise(async (resolve, reject) => {
      try {
        await this._ensurePdfDirectoryExists(); // Ensure directory exists right before creating the stream
        await logger.debug(
          funcPrefix,
          `Creating write stream for ${this._filePath}`,
        );
        this._stream = createWriteStream(this._filePath);

        this._stream.on("finish", () => {
          logger.info(funcPrefix, "PDF stream finished.");
          this._success = true; // Mark success on finish
          resolve();
        });

        this._stream.on("error", (err) => {
          logger.error(funcPrefix, "PDF stream error", err);
          this._success = false;
          reject(new Error(`PDF stream error: ${err.message}`));
        });

        if (!this._doc) {
          reject(
            new Error("PDF Document not initialized before setting up stream."),
          );
          return;
        }

        this._doc.on("error", (err) => {
          logger.error(funcPrefix, "PDF document error during piping", err);
          this._success = false;
          reject(new Error(`PDF document error: ${err.message}`));
        });

        await logger.debug(funcPrefix, "Piping PDF document to stream...");
        this._doc.pipe(this._stream);
      } catch (setupError) {
        const errorMessage = setupError instanceof Error ? setupError : new Error(String(setupError));
        await logger.error(
          funcPrefix,
          "Error setting up PDF stream or piping",
          errorMessage,
        );
        reject(errorMessage); // Reject the promise on setup error
      }
    });
  }

  private _addHeader(isTaxInvoice: boolean): void {
    if (!this._doc) return;
    this._doc
      .font(pdfStyles.FONT_BOLD)
      .fontSize(pdfStyles.HEADER_FONT_SIZE)
      .text(isTaxInvoice ? "TAX INVOICE" : "INVOICE", { align: "center" });
    this._doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE); // Revert to regular, smaller size
    this._doc.moveDown();
  }

  private _addSellerInfo(seller: SellerProfile): void {
    if (!this._doc) return;
    const funcPrefix = `${this._logPrefix}:_addSellerInfo`;
    logger.debug(funcPrefix, "Adding seller info");
    this._doc
      .font(pdfStyles.FONT_BOLD)
      .fontSize(pdfStyles.SECTION_LABEL_FONT_SIZE)
      .text("From:", { underline: false }); 
    this._doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    this._doc.text(seller.name || "Seller Name Missing");
    this._doc.text(seller.business_address || "Seller Address Missing");
    this._doc.text(`ABN/ACN: ${seller.ABN_or_ACN || "Seller ABN/ACN Missing"}`);
    this._doc.text(`Email: ${seller.contact_email || "Seller Email Missing"}`);
    if (seller.phone) {
      this._doc.text(`Phone: ${seller.phone}`);
    }
    this._doc.moveDown();
  }

  private _addCustomerInfo(customer: Omit<Customer, "id">): void {
    if (!this._doc) return;
    const funcPrefix = `${this._logPrefix}:_addCustomerInfo`;
    logger.debug(funcPrefix, "Adding customer info");
    this._doc
      .font(pdfStyles.FONT_BOLD)
      .fontSize(pdfStyles.SECTION_LABEL_FONT_SIZE)
      .text("To:", { underline: false });
    this._doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE); // Normal text for details
    if (customer.customer_type === "business") {
      this._doc.text(customer.business_name || "Business Name Missing");
      if (customer.abn) {
        this._doc.text(`ABN: ${customer.abn}`);
      }
      const contactName =
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
      if (contactName) {
        this._doc.text(`Contact: ${contactName}`);
      }
    } else {
      const individualName =
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
      this._doc.text(individualName || "Customer Name Missing");
    }
    this._doc.text(`Email: ${customer.email || "N/A"}`);
    this._doc.text(`Phone: ${customer.phone || "N/A"}`);
    this._doc.text(`Address: ${customer.address || "N/A"}`);
    this._doc.moveDown();
  }

  private _addInvoiceDetails(invoiceId: string, dateIsoString: string): void {
    if (!this._doc) return;
    const funcPrefix = `${this._logPrefix}:_addInvoiceDetails`;
    logger.debug(
      funcPrefix,
      `Adding invoice details ID: ${invoiceId}, Date: ${dateIsoString}`,
    );
    this._doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    this._doc.text(`Invoice ID: ${invoiceId}`);
    try {
      const dateObject = parseISO(dateIsoString);
      if (isNaN(dateObject.getTime())) {
        throw new Error("Invalid date object after parsing");
      }
      const formattedDate = format(dateObject, "dd/MM/yyyy");
      this._doc.text(`Date: ${formattedDate}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e : new Error(String(e));
      logger.warn(
        funcPrefix,
        `Could not parse or format date for PDF: ${dateIsoString}`,
        errorMessage,
      );
      this._doc.text(`Date: ${dateIsoString}`); // Fallback to ISO string
    }
    this._doc.moveDown(1.5); // More space before table
  }

  private _drawTableHeader(includeGstColumn: boolean, y: number): void {
    if (!this._doc) return;
    const funcPrefix = `${this._logPrefix}:_drawTableHeader`;
    logger.debug(funcPrefix, `Drawing table header at Y=${y}`);
    const startX = this._doc.page.margins.left;
    const endX = this._doc.page.width - this._doc.page.margins.right;
    
    // Use offsets from pdfStyles for column positions
    const itemCol = startX + pdfStyles.ITEM_COL_X_OFFSET;
    // Calculate subsequent columns based on fixed widths or relative positions
    // This part needs careful adjustment based on how ITEM_COL_X_OFFSET and widths are defined in pdfStyles.ts
    // For simplicity, I'm keeping the existing logic for now, but this is where you'd integrate more deeply.
    const gstCol = startX + pdfStyles.GST_COL_X_OFFSET; // Example: if GST_COL_X_OFFSET is absolute from startX
    const qtyCol = startX + pdfStyles.QTY_COL_X_OFFSET;
    const priceCol = startX + pdfStyles.PRICE_COL_X_OFFSET;
    const totalCol = startX + pdfStyles.TOTAL_COL_X_OFFSET;

    // Adjust columns if GST is not included
    const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
    const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
    const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;

    // Width calculations should also ideally use constants or be derived
    const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10; // 10 for padding
    const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
    const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
    const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
    const totalWidth = endX - effectiveTotalCol;

    this._doc.font(pdfStyles.FONT_BOLD).fontSize(pdfStyles.TABLE_FONT_SIZE);
    this._doc.text("Item", itemCol, y, { width: itemWidth, underline: true });
    if (includeGstColumn)
      this._doc.text("GST?", gstCol, y, {
        width: gstWidth,
        underline: true,
        align: "center",
      });
    this._doc.text("Qty", effectiveQtyCol, y, {
      width: qtyWidth,
      underline: true,
      align: "right",
    });
    this._doc.text("Unit Price", effectivePriceCol, y, {
      width: priceWidth,
      underline: true,
      align: "right",
    });
    this._doc.text("Line Total", effectiveTotalCol, y, {
      width: totalWidth,
      underline: true,
      align: "right",
    });
    this._doc.moveDown(0.5);
    this._doc.font(pdfStyles.FONT_REGULAR); // Revert font
  }

  private _addLineItemsTable(
    lineItems: LineItem[],
    includeGstColumn: boolean,
  ): void {
    if (!this._doc) return;
    const funcPrefix = `${this._logPrefix}:_addLineItemsTable`;
    logger.debug(
      funcPrefix,
      `Adding ${lineItems.length} line items to table. Include GST Col: ${includeGstColumn}`,
    );
    const tableTopInitial = this._doc.y;
    const startX = this._doc.page.margins.left;
    const endX = this._doc.page.width - this._doc.page.margins.right;

    // Column positions - similar to _drawTableHeader, use styles
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
      this._doc.page.height - this._doc.page.margins.bottom - pdfStyles.TABLE_BOTTOM_MARGIN;

    this._drawTableHeader(includeGstColumn, tableTopInitial);
    let currentY = this._doc.y;

    lineItems.forEach((item, index) => {
      // Estimate row height dynamically - fontSize is a method, not an option here.
      // this._doc.fontSize(pdfStyles.TABLE_FONT_SIZE); // Ensure font size is set for heightOfString
      const itemHeightEstimate = this._doc!.fontSize(pdfStyles.TABLE_FONT_SIZE).heightOfString("X") + 5;

      if (currentY + itemHeightEstimate > pageBottom) {
        logger.debug(
          funcPrefix,
          `Adding new page before item ${index + 1} at Y=${currentY}. Page bottom limit: ${pageBottom}`,
        );
        this._doc!.addPage();
        currentY = this._doc!.page.margins.top; // Reset Y to top margin
        this._drawTableHeader(includeGstColumn, currentY);
        currentY = this._doc!.y; // Get Y position after header
      }

      const unitPriceExGST = item.unit_price ?? 0;
      const lineTotalExGST = item.line_total ?? 0;

      // Draw row content
      this._doc!.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.TABLE_FONT_SIZE);
      const rowStartY = currentY; 
      this._doc!.text(item.product_name || "N/A", itemCol, rowStartY, {
        width: itemWidth,
      });

      // Calculate actual height after potentially multi-line item name
      // Ensure font size is set before calling heightOfString
      const actualHeight = this._doc!.fontSize(pdfStyles.TABLE_FONT_SIZE).heightOfString(
        item.product_name || "N/A",
        { width: itemWidth },
      );
      const rightColumnsY = rowStartY; 

      if (includeGstColumn)
        this._doc!.text(
          item.GST_applicable ? "Yes" : "No",
          gstCol,
          rightColumnsY,
          { width: gstWidth, align: "center" },
        );
      this._doc!.text(
        item.quantity?.toString() ?? "0",
        effectiveQtyCol,
        rightColumnsY,
        { width: qtyWidth, align: "right" },
      );
      this._doc!.text(
        `$${unitPriceExGST.toFixed(2)}`,
        effectivePriceCol,
        rightColumnsY,
        { width: priceWidth, align: "right" },
      );
      this._doc!.text(
        `$${lineTotalExGST.toFixed(2)}`,
        effectiveTotalCol,
        rightColumnsY,
        { width: totalWidth, align: "right" },
      );

      currentY = rowStartY + actualHeight + 3;
      this._doc!.y = currentY; 
    });

    this._doc!.moveDown(0.5); 

    logger.debug(
      funcPrefix,
      `Drawing separator line before totals at Y=${this._doc!.y}`,
    );
    this._doc!.moveTo(startX, this._doc!.y)
      .lineTo(endX, this._doc!.y)
      .strokeColor(pdfStyles.COLOR_GREY_LIGHT)
      .stroke();
    this._doc!.moveDown(0.5);
  }

  private _addTotals(subtotal: number, gstAmount: number, total: number): void {
    if (!this._doc) return;
    const funcPrefix = `${this._logPrefix}:_addTotals`;
    logger.debug(
      funcPrefix,
      `Adding totals: Sub=${subtotal}, GST=${gstAmount}, Total=${total}`,
    );
    const totalsX = this._doc.page.width - this._doc.page.margins.right - 150; // Align amounts to the right
    const labelX = this._doc.page.margins.left;
    const endX = this._doc.page.width - this._doc.page.margins.right;
    let totalsY = this._doc.y;

    const pageBottom =
      this._doc.page.height - this._doc.page.margins.bottom - 20; // Small buffer
    
    if (totalsY + pdfStyles.TOTALS_SECTION_HEIGHT_ESTIMATE > pageBottom) {
      logger.debug(
        funcPrefix,
        `Adding new page before totals section at Y=${totalsY}. Page bottom limit: ${pageBottom}`,
      );
      this._doc.addPage();
      totalsY = this._doc.page.margins.top;
      this._doc.y = totalsY;
    }

    this._doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.TOTALS_FONT_SIZE);
    const amountWidth = endX - totalsX;

    // Subtotal
    this._doc.text(`Subtotal (ex GST):`, labelX, totalsY, {
      align: "left",
    });
    this._doc.text(`$${subtotal.toFixed(2)}`, totalsX, totalsY, {
      align: "right",
      width: amountWidth,
    });
    totalsY = this._doc.y + 2;

    if (gstAmount > 0) {
      this._doc.text(`GST Amount (10%):`, labelX, totalsY, {
        align: "left",
      });
      this._doc.text(`$${gstAmount.toFixed(2)}`, totalsX, totalsY, {
        align: "right",
        width: amountWidth,
      });
      totalsY = this._doc.y + 2;
    }

    const lineY = totalsY + 5;
    logger.debug(funcPrefix, `Drawing separator line for totals at Y=${lineY}`);
    this._doc
      .moveTo(totalsX - 20, lineY) // Adjusted line start slightly
      .lineTo(endX, lineY)
      .strokeColor(pdfStyles.COLOR_GREY_MEDIUM)
      .stroke();
    totalsY = lineY + 5;
    this._doc.y = totalsY;

    this._doc.font(pdfStyles.FONT_BOLD).fontSize(pdfStyles.TOTALS_TOTAL_FONT_SIZE);
    this._doc.text(`Total Amount:`, labelX, totalsY, {
      align: "left",
    });
    this._doc.text(`$${total.toFixed(2)}`, totalsX, totalsY, {
      align: "right",
      width: amountWidth,
    });
    totalsY = this._doc.y;

    this._doc.font(pdfStyles.FONT_REGULAR).fontSize(pdfStyles.BODY_FONT_SIZE);
    this._doc.y = totalsY;
    this._doc.moveDown();
  }

  private async _finalize(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_finalize`;
    return new Promise((resolve, reject) => {
      if (!this._doc || !this._stream) {
        const errorMsg = !this._doc
          ? "Document not initialized."
          : "Stream not initialized.";
        logger.error(funcPrefix, `Finalize called prematurely. ${errorMsg}`);
        return reject(new Error(errorMsg));
      }

      const streamFinishPromise = new Promise<void>((res, rej) => {
        this._stream!.once("finish", res);
        this._stream!.once("error", rej); // Stream errors reject
        this._doc!.once("error", rej);    // Document errors also reject
      });

      logger.info(funcPrefix, "Finalizing PDF document (calling end())...");
      this._doc.end();

      streamFinishPromise
        .then(() => {
          logger.info(
            funcPrefix,
            "Stream finished successfully during finalize.",
          );
          this._success = true;
          resolve();
        })
        .catch((err) => {
          const errorMessage = err instanceof Error ? err : new Error(String(err));
          logger.error(
            funcPrefix,
            "Stream or document error during finalize",
            errorMessage,
          );
          this._success = false;
          reject(errorMessage);
        });
    });
  }

  private async _cleanupFailedPdf(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_cleanupFailedPdf`;
    if (!this._filePath) {
      await logger.debug(
        funcPrefix,
        "Cleanup called without a file path, likely initialization failed early.",
      );
      return;
    }
    await logger.warn(funcPrefix, `Attempting cleanup for: ${this._filePath}`);
    try {
      if (this._stream && !this._stream.closed && this._stream.writable) {
        await logger.debug(
          funcPrefix,
          "Closing potentially open write stream...",
        );
        await new Promise<void>((resolve, reject) => { // Added reject for clarity
          this._stream!.once("close", resolve);
          this._stream!.once("error", (err) => {
            logger.error(
              funcPrefix,
              "Error closing stream during cleanup",
              err, // Pass the actual error
            );
            resolve(); // Still resolve as cleanup should try to continue
          });
          this._stream!.end();
        });
        await logger.debug(
          funcPrefix,
          "Finished waiting for stream close/error.",
        );
      } else {
        await logger.debug(
          funcPrefix,
          "No active/writable stream to close or already closed.",
        );
      }

      await logger.debug(
        funcPrefix,
        `Checking existence of potentially incomplete PDF: ${this._filePath}`,
      );
      try {
        accessSync(this._filePath);
        await logger.warn(
          funcPrefix,
          `Attempting to delete incomplete/corrupted PDF: ${this._filePath}`,
        );
        unlinkSync(this._filePath);
        await logger.info(
          funcPrefix,
          `Deleted incomplete/corrupted PDF: ${this._filePath}`,
        );
      } catch (accessOrUnlinkError: any) {
        if (accessOrUnlinkError.code === "ENOENT") {
          await logger.info(
            funcPrefix,
            `Incomplete PDF ${this._filePath} did not exist, no need to delete.`,
          );
        } else {
          const errorMessage = accessOrUnlinkError instanceof Error ? accessOrUnlinkError : new Error(String(accessOrUnlinkError));
          await logger.error(
            funcPrefix,
            "Error accessing or deleting potentially corrupted PDF during cleanup",
            errorMessage,
          );
        }
      }
    } catch (cleanupError) {
      const errorMessage = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
      await logger.error(
        funcPrefix,
        "Error during PDF cleanup process itself",
        errorMessage,
      );
    } finally {
      this._doc = null;
      this._stream = null;
    }
  }

  public async generate(
    receipt: Receipt,
    operationId: string,
  ): Promise<PdfGenerationResult> {
    try {
      this._initialize(receipt.receipt_id, operationId);
    } catch (initError: any) { // Keep any for broad initial catch
      const errorToLog = initError instanceof Error ? initError : new Error(String(initError));
      await logger.error(
        this._logPrefix || // Fallback log prefix
          `[${operationId} PDFKit ${receipt?.receipt_id || "unknown"}]`,
        "ERROR during PDF initialization",
        errorToLog,
      );
      return {
        success: false,
        message: errorToLog.message || "PDF initialization failed.",
      };
    }

    try {
      await this._setupStream();

      // --- Add Content ---
      await logger.debug(this._logPrefix, "Adding content to PDF...");
      this._addHeader(receipt.is_tax_invoice);
      this._addSellerInfo(receipt.seller_profile_snapshot);
      this._addCustomerInfo(receipt.customer_snapshot);
      this._addInvoiceDetails(receipt.receipt_id, receipt.date_of_purchase);
      this._addLineItemsTable(receipt.line_items, receipt.GST_amount > 0);
      this._addTotals(
        receipt.subtotal_excl_GST,
        receipt.GST_amount,
        receipt.total_inc_GST,
      );

      // --- Finalize Document ---
      await this._finalize();

      await logger.info(
        this._logPrefix,
        `PDF generation process completed. Success flag: ${this._success}`,
      );
      if (!this._success) {
        throw new Error(
          "PDF generation failed: Finalize completed but success flag is false.",
        );
      }
      await logger.info(this._logPrefix, "PDF generation successful.");
      const finalFilePath = this._filePath;
      this._doc = null;
      this._stream = null;
      this._filePath = "";
      return { success: true, filePath: finalFilePath };
    } catch (error: any) { // Keep any for broad catch during generation
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      await logger.error(
        this._logPrefix,
        "ERROR during PDF generation orchestration",
        errorToLog,
      );
      await this._cleanupFailedPdf();

      return { success: false, message: errorToLog.message || "Unknown error during PDF generation" };
    }
  }
}
