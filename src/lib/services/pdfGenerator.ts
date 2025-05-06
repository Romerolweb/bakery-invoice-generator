// src/lib/services/pdfGenerator.ts
import type { Receipt, LineItem, Customer, SellerProfile } from '@/lib/types';
import { promises as fsPromises, createWriteStream, WriteStream, accessSync, unlinkSync } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { format, parseISO } from 'date-fns';
import { logger } from '@/lib/services/logging'; // Import the logger

const DATA_DIR = path.join(process.cwd(), 'src', 'lib', 'data');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs

// Define standard font names as used in PDFKit
const FONT_NAMES = {
    Regular: 'Helvetica',
    Bold: 'Helvetica-Bold',
};

export class PdfGenerator {
    private doc: PDFKit.PDFDocument | null = null;
    private stream: WriteStream | null = null;
    private filePath: string = '';
    private logPrefix: string = '';
    private success: boolean = false;
    private operationId: string = ''; // To correlate logs

    // Ensure the PDF directory exists
    private async ensurePdfDirectoryExists(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:ensurePdfDirectoryExists`;
        try {
            await fsPromises.mkdir(PDF_DIR, { recursive: true });
            logger.debug(funcPrefix, `PDF directory ensured: ${PDF_DIR}`);
        } catch (error) {
            logger.error(funcPrefix, 'FATAL: Error creating PDF directory', error);
            throw new Error(`Failed to ensure PDF directory exists: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private initialize(receiptId: string, operationId: string): void {
        this.operationId = operationId;
        this.logPrefix = `[${operationId} PDFKit ${receiptId}]`; // Indicate PDFKit
        this.filePath = path.join(PDF_DIR, `${receiptId}.pdf`);
        logger.info(this.logPrefix, `Initializing PDF generation for path: ${this.filePath}`);
        try {
            this.doc = new PDFDocument({
                 margin: 50,
                 bufferPages: true,
                 // Use default built-in Helvetica font. No need to register explicitly unless using custom fonts.
                 // PDFKit bundles standard fonts. Errors often relate to missing files if the installation is corrupt
                 // or if custom font paths are incorrect.
            });
             logger.debug(this.logPrefix, `PDFDocument instantiated successfully.`);
        } catch (instantiationError) {
            logger.error(this.logPrefix, `FATAL: Error instantiating PDFDocument`, instantiationError);
            throw new Error(`PDF library initialization error: ${instantiationError instanceof Error ? instantiationError.message : String(instantiationError)}`);
        }
        this.success = false; // Reset success flag
    }

    private async setupStream(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:setupStream`;
        return new Promise(async (resolve, reject) => {
            try {
                await this.ensurePdfDirectoryExists(); // Ensure directory exists right before creating the stream
                logger.debug(funcPrefix, `Creating write stream for ${this.filePath}`);
                this.stream = createWriteStream(this.filePath);

                this.stream.on('finish', () => {
                    logger.info(funcPrefix, 'PDF stream finished.');
                    this.success = true; // Mark success on finish
                    resolve();
                });

                this.stream.on('error', (err) => {
                    logger.error(funcPrefix, 'PDF stream error', err);
                    this.success = false;
                    reject(new Error(`PDF stream error: ${err.message}`));
                });

                if (!this.doc) {
                    reject(new Error("PDF Document not initialized before setting up stream."));
                    return;
                }

                // Handle errors from the PDF document itself during the piping process
                this.doc.on('error', (err) => {
                    logger.error(funcPrefix, 'PDF document error during piping', err);
                    this.success = false;
                    // Attempt to close the stream to prevent hanging resources
                    this.stream?.close();
                    reject(new Error(`PDF document error: ${err.message}`));
                });

                logger.debug(funcPrefix, 'Piping PDF document to stream...');
                this.doc.pipe(this.stream);

            } catch (setupError) {
                 logger.error(funcPrefix, 'Error setting up PDF stream or piping', setupError);
                 reject(setupError); // Reject the promise on setup error
            }
        });
    }

    // Renamed from _addHeader to addHeader, follows same pattern for others
    private addHeader(isTaxInvoice: boolean): void {
        if (!this.doc) return;
        this.doc.fontSize(20).font(FONT_NAMES.Bold).text(isTaxInvoice ? 'TAX INVOICE' : 'INVOICE', { align: 'center' });
        this.doc.font(FONT_NAMES.Regular).fontSize(10); // Revert to regular, smaller size
        this.doc.moveDown();
    }

    private addSellerInfo(seller: SellerProfile): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addSellerInfo`;
         logger.debug(funcPrefix, 'Adding seller info');
         this.doc.fontSize(12).font(FONT_NAMES.Bold).text('From:', { underline: false });
         this.doc.font(FONT_NAMES.Regular).fontSize(10);
         this.doc.text(seller.name || 'Seller Name Missing');
         this.doc.text(seller.business_address || 'Seller Address Missing');
         this.doc.text(`ABN/ACN: ${seller.ABN_or_ACN || 'Seller ABN/ACN Missing'}`);
         this.doc.text(`Email: ${seller.contact_email || 'Seller Email Missing'}`);
         if (seller.phone) {
             this.doc.text(`Phone: ${seller.phone}`);
         }
         this.doc.moveDown();
    }

     private addCustomerInfo(customer: Omit<Customer, 'id'>): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addCustomerInfo`;
         logger.debug(funcPrefix, 'Adding customer info');
         this.doc.fontSize(12).font(FONT_NAMES.Bold).text('To:', { underline: false });
         this.doc.font(FONT_NAMES.Regular).fontSize(10);
         if (customer.customer_type === 'business') {
             this.doc.text(customer.business_name || 'Business Name Missing');
             if (customer.abn) {
                 this.doc.text(`ABN: ${customer.abn}`);
             }
             const contactName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
             if (contactName) {
                 this.doc.text(`Contact: ${contactName}`);
             }
         } else {
             const individualName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
             this.doc.text(individualName || 'Customer Name Missing');
         }
         this.doc.text(`Email: ${customer.email || 'N/A'}`);
         this.doc.text(`Phone: ${customer.phone || 'N/A'}`);
         this.doc.text(`Address: ${customer.address || 'N/A'}`);
         this.doc.moveDown();
     }

     private addInvoiceDetails(invoiceId: string, dateIsoString: string): void {
        if (!this.doc) return;
        const funcPrefix = `${this.logPrefix}:addInvoiceDetails`;
        logger.debug(funcPrefix, `Adding invoice details ID: ${invoiceId}, Date: ${dateIsoString}`);
        this.doc.fontSize(10);
        this.doc.text(`Invoice ID: ${invoiceId}`);
        try {
            // Attempt to parse the date string (assuming ISO format from backend)
            const dateObject = parseISO(dateIsoString);
             // Check if parsing resulted in a valid date
            if (isNaN(dateObject.getTime())) {
                throw new Error('Invalid date object after parsing');
            }
            const formattedDate = format(dateObject, 'dd/MM/yyyy');
            this.doc.text(`Date: ${formattedDate}`);
        } catch (e) {
            logger.warn(funcPrefix, `Could not parse or format date for PDF: ${dateIsoString}. Using original string.`, e);
            // Fallback: Display the original string if parsing/formatting fails
            this.doc.text(`Date: ${dateIsoString}`);
        }
        this.doc.moveDown(1.5); // More space before table
    }

    private drawTableHeader(includeGstColumn: boolean, y: number): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:drawTableHeader`;
         logger.debug(funcPrefix, `Drawing table header at Y=${y}`);
         const startX = this.doc.page.margins.left;
         const endX = this.doc.page.width - this.doc.page.margins.right;
         // Define column positions (adjust these based on desired layout)
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

        // Dynamically adjust columns based on whether GST column is needed
         const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol; // Qty starts where GST would if no GST col
         const effectivePriceCol = includeGstColumn ? priceCol : qtyCol; // Price starts where Qty would
         const effectiveTotalCol = includeGstColumn ? totalCol : priceCol; // Total starts where Price would

         // Calculate widths based on adjusted positions
         const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10; // Width up to next column
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0; // Zero width if not included
         const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
         const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
         const totalWidth = endX - effectiveTotalCol; // Width to the right margin

         this.doc.fontSize(10).font(FONT_NAMES.Bold);
         this.doc.text('Item', itemCol, y, { width: itemWidth, underline: true });
         if (includeGstColumn) this.doc.text('GST?', gstCol, y, { width: gstWidth, underline: true, align: 'center' });
         this.doc.text('Qty', effectiveQtyCol, y, { width: qtyWidth, underline: true, align: 'right' });
         this.doc.text('Unit Price', effectivePriceCol, y, { width: priceWidth, underline: true, align: 'right' });
         this.doc.text('Line Total', effectiveTotalCol, y, { width: totalWidth, underline: true, align: 'right' });
         this.doc.moveDown(0.5);
         this.doc.font(FONT_NAMES.Regular); // Revert font
     }

     private addLineItemsTable(lineItems: LineItem[], includeGstColumn: boolean): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addLineItemsTable`;
         logger.debug(funcPrefix, `Adding ${lineItems.length} line items to table. Include GST Col: ${includeGstColumn}`);
         const tableTopInitial = this.doc.y;
         const startX = this.doc.page.margins.left;
         const endX = this.doc.page.width - this.doc.page.margins.right;
         // Define column positions consistent with drawTableHeader
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

        // Dynamically adjust columns based on whether GST column is needed
         const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
         const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
         const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;

         // Calculate widths based on adjusted positions
         const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10;
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
         const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
         const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
         const totalWidth = endX - effectiveTotalCol;

         const tableBottomMargin = 70; // Reserve space for totals + buffer
         const pageBottomLimit = this.doc.page.height - this.doc.page.margins.bottom - tableBottomMargin;

         this.drawTableHeader(includeGstColumn, tableTopInitial);
         let currentY = this.doc.y;

         lineItems.forEach((item, index) => {
             // Estimate height needed for the current item description
             const itemNameText = `${item.product_name || 'N/A'}${item.description ? `\n(${item.description})` : ''}`;
             const itemHeightEstimate = this.doc!.heightOfString(itemNameText, { width: itemWidth, fontSize: 10 }) + 5; // Add padding

             // Check if adding this item exceeds the page limit
             if (currentY + itemHeightEstimate > pageBottomLimit) {
                 logger.debug(funcPrefix, `Adding new page before item ${index + 1} at Y=${currentY}. Page bottom limit: ${pageBottomLimit}`);
                 this.doc!.addPage();
                 currentY = this.doc!.page.margins.top; // Reset Y to top margin of new page
                 this.drawTableHeader(includeGstColumn, currentY); // Redraw header on new page
                 currentY = this.doc!.y; // Get Y position after drawing the header
             }

             const unitPriceExGST = item.unit_price ?? 0;
             const lineTotalExGST = item.line_total ?? 0;

             // Draw row content at currentY
             this.doc!.fontSize(10).font(FONT_NAMES.Regular);
             this.doc!.text(itemNameText, itemCol, currentY, { width: itemWidth });

             // Store Y before drawing right-aligned columns to align them vertically with multi-line item text
             const rightColumnsY = currentY;

             if (includeGstColumn) this.doc!.text(item.GST_applicable ? 'Yes' : 'No', gstCol, rightColumnsY, { width: gstWidth, align: 'center' });
             this.doc!.text(item.quantity?.toString() ?? '0', effectiveQtyCol, rightColumnsY, { width: qtyWidth, align: 'right' });
             this.doc!.text(`$${unitPriceExGST.toFixed(2)}`, effectivePriceCol, rightColumnsY, { width: priceWidth, align: 'right' });
             this.doc!.text(`$${lineTotalExGST.toFixed(2)}`, effectiveTotalCol, rightColumnsY, { width: totalWidth, align: 'right' });

             // Calculate the actual height used by the potentially multi-line item name/description
             const actualHeight = this.doc!.heightOfString(itemNameText, { width: itemWidth });
             currentY += actualHeight + 3; // Move Y down by the actual height + a small gap
             this.doc!.y = currentY; // Sync the document's internal Y position
         });

         this.doc!.moveDown(0.5); // Add a bit more space before the separator line

         // Draw a line separating items from totals
         logger.debug(funcPrefix, `Drawing separator line before totals at Y=${this.doc!.y}`);
         this.doc!.moveTo(startX, this.doc!.y).lineTo(endX, this.doc!.y).strokeColor('#cccccc').stroke();
         this.doc!.moveDown(0.5);
     }

     private addTotals(subtotal: number, gstAmount: number, total: number): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addTotals`;
         logger.debug(funcPrefix, `Adding totals: Sub=${subtotal}, GST=${gstAmount}, Total=${total}`);
         // Define layout for totals section
         const totalsX = 400; // X position for the start of the amount values
         const labelX = this.doc.page.margins.left; // X position for the labels (align left)
         const endX = this.doc.page.width - this.doc.page.margins.right; // Right edge for alignment
         let totalsY = this.doc.y; // Current Y position

         const pageBottom = this.doc.page.height - this.doc.page.margins.bottom - 20; // Leave some bottom margin
         const totalsHeightEstimate = 60; // Estimated height for the entire totals block

         // Check if there's enough space for totals, add a new page if not
         if (totalsY + totalsHeightEstimate > pageBottom) {
             logger.debug(funcPrefix, `Adding new page before totals section at Y=${totalsY}. Page bottom limit: ${pageBottom}`);
             this.doc.addPage();
             totalsY = this.doc.page.margins.top; // Reset Y position for the new page
             this.doc.y = totalsY; // Set the document's Y position
         }

         // Set font for labels and amounts (except the final total)
         this.doc.fontSize(10).font(FONT_NAMES.Regular);
         const amountWidth = endX - totalsX; // Calculate width for amount column

         // Draw Subtotal
         this.doc.text(`Subtotal (ex GST):`, labelX, totalsY, { continued: false, align: 'left' });
         this.doc.text(`$${subtotal.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth });
         totalsY = this.doc.y + 2; // Move Y down slightly

         // Draw GST Amount (only if applicable)
         if (gstAmount > 0) {
            this.doc.text(`GST Amount (10%):`, labelX, totalsY, { continued: false, align: 'left' });
            this.doc.text(`$${gstAmount.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth });
            totalsY = this.doc.y + 2; // Move Y down slightly
         }

         // Draw Separator Line before the final total
         const lineY = totalsY + 5; // Position the line below the last entry
         logger.debug(funcPrefix, `Drawing separator line for totals at Y=${lineY}`);
         // Draw line only above the total amount column for emphasis
         this.doc.moveTo(totalsX - 10, lineY).lineTo(endX, lineY).strokeColor('#aaaaaa').stroke();
         totalsY = lineY + 5; // Move current position below the line
         this.doc.y = totalsY;

         // Draw Total Amount (Bold and slightly larger)
         this.doc.font(FONT_NAMES.Bold).fontSize(12);
         this.doc.text(`Total Amount:`, labelX, totalsY, { continued: false, align: 'left'});
         this.doc.text(`$${total.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth });
         totalsY = this.doc.y; // Update Y after drawing the text

         // Revert font settings for any subsequent text
         this.doc.font(FONT_NAMES.Regular).fontSize(10);
         this.doc.y = totalsY; // Ensure doc.y is at the end of the totals block
         this.doc.moveDown(); // Add final spacing
     }

    private async finalize(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:finalize`;
        return new Promise((resolve, reject) => {
            if (!this.doc || !this.stream) {
                 const errorMsg = !this.doc ? "Document not initialized." : "Stream not initialized.";
                 logger.error(funcPrefix, `Finalize called prematurely. ${errorMsg}`);
                 return reject(new Error(errorMsg));
            }

             // Wrap stream events in a promise
             const streamFinishPromise = new Promise<void>((res, rej) => {
                 this.stream!.once('finish', () => {
                     logger.debug(funcPrefix, 'Stream emitted "finish" event.');
                     res();
                 });
                 this.stream!.once('error', (err) => {
                     logger.error(funcPrefix, 'Stream emitted "error" event.', err);
                     rej(err);
                 });
                  // Also listen for errors on the document itself during finalization
                 this.doc!.once('error', (err) => {
                      logger.error(funcPrefix, 'Document emitted "error" event during finalization.', err);
                      rej(err);
                  });
             });

            logger.info(funcPrefix, 'Finalizing PDF document (calling end())...');
            this.doc.end(); // This triggers the piping process to complete and emits 'finish' or 'error' on the stream.

             // Wait for the stream to finish or error out
             streamFinishPromise
                 .then(() => {
                     logger.info(funcPrefix, 'Stream finished successfully during finalize.');
                     this.success = true; // Confirm success
                     resolve();
                 })
                 .catch((err) => {
                     logger.error(funcPrefix, 'Stream or document error caught during finalize', err);
                     this.success = false; // Mark as failed
                     reject(err); // Propagate the error
                 });
        });
    }

    private async cleanupFailedPdf(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:cleanupFailedPdf`;
        if (!this.filePath) {
            logger.debug(funcPrefix, "Cleanup called without a file path, likely initialization failed early.");
            return;
        }
        logger.warn(funcPrefix, `Attempting cleanup for potentially failed PDF generation: ${this.filePath}`);

        // Ensure stream is closed before attempting delete
        if (this.stream && !this.stream.closed) {
            logger.debug(funcPrefix, 'Closing potentially open write stream...');
            await new Promise<void>((resolve) => {
                this.stream!.once('close', () => { logger.debug(funcPrefix, 'Stream closed during cleanup.'); resolve(); });
                this.stream!.once('error', (err) => { logger.error(funcPrefix, 'Error closing stream during cleanup', err); resolve(); }); // Resolve even on error to proceed with unlink attempt
                this.stream!.end(() => { logger.debug(funcPrefix, 'Stream end() called during cleanup.'); });
            });
        } else {
            logger.debug(funcPrefix, 'No active/writable stream to close or stream already closed.');
        }

        // Attempt to delete the file
        try {
            logger.debug(funcPrefix, `Checking existence and attempting delete: ${this.filePath}`);
            accessSync(this.filePath); // Check if file exists (throws if not)
            logger.warn(funcPrefix, `Deleting incomplete/corrupted PDF: ${this.filePath}`);
            unlinkSync(this.filePath);
            logger.info(funcPrefix, `Successfully deleted incomplete/corrupted PDF: ${this.filePath}`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                logger.info(funcPrefix, `Incomplete PDF ${this.filePath} did not exist, no need to delete.`);
            } else {
                // Log other errors (e.g., permissions) but don't let cleanup fail the whole process
                logger.error(funcPrefix, 'Error during PDF file deletion in cleanup', error);
            }
        } finally {
             // Reset state even if cleanup had issues
             this.doc = null;
             this.stream = null;
             // Keep filePath and logPrefix for potential further debugging if needed
        }
    }

    /**
     * Generates the PDF receipt.
     * @param receipt - The receipt data.
     * @param operationId - A unique ID for logging this specific generation attempt.
     * @returns Promise resolving to an object indicating success, optional error message, and file path.
     */
    public async generate(receipt: Receipt, operationId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
        try {
            this.initialize(receipt.receipt_id, operationId);
        } catch(initError: any) {
             // Initialization errors are critical (e.g., cannot instantiate PDFDocument)
             logger.error(this.logPrefix || `[${operationId} PDFKit ${receipt?.receipt_id || 'unknown'}]`, 'ERROR during PDF initialization', initError);
             return { success: false, message: initError.message || "PDF initialization failed." };
        }

        try {
            // Setup the stream - this might fail if directory creation fails
            await this.setupStream();

            // --- Add Content to PDF ---
            // Errors during content addition should be caught here
            logger.debug(this.logPrefix, 'Adding content to PDF document...');
            this.addHeader(receipt.is_tax_invoice);
            this.addSellerInfo(receipt.seller_profile_snapshot);
            this.addCustomerInfo(receipt.customer_snapshot);
            this.addInvoiceDetails(receipt.receipt_id, receipt.date_of_purchase);
            this.addLineItemsTable(receipt.line_items, receipt.GST_amount > 0);
            this.addTotals(receipt.subtotal_excl_GST, receipt.GST_amount, receipt.total_inc_GST);
            logger.debug(this.logPrefix, 'Finished adding content to PDF document.');

            // --- Finalize Document and Stream ---
            // This waits for the stream 'finish' or 'error' event
            await this.finalize();

            logger.info(this.logPrefix, `PDF generation process completed.`);

            if (!this.success) {
                 // Should ideally be caught by finalize() rejection, but double-check
                 throw new Error("PDF generation failed after content addition, stream did not finish successfully.");
            }

            logger.info(this.logPrefix, 'PDF generation successful.');
            const finalFilePath = this.filePath; // Capture path before reset
             // Reset internal state for potential reuse of the instance (though unlikely in serverless action)
             this.doc = null;
             this.stream = null;
             this.filePath = '';
             this.logPrefix = '';
             this.operationId = '';
             this.success = false;
            return { success: true, filePath: finalFilePath };

        } catch (error: any) {
             // Catch errors from setupStream, content addition, or finalize
             logger.error(this.logPrefix, 'ERROR during PDF generation orchestration', error);
             await this.cleanupFailedPdf(); // Attempt cleanup regardless of where error occurred

             const message = `Failed to generate PDF: ${error.message || 'Unknown error during generation'}`;
             // Optionally add more specific checks here (e.g., font errors mentioned previously)
             // if (error.message?.includes('Font')) { ... }

             return { success: false, message };
        }
    }
}
