// src/lib/services/pdfGenerator.ts
import type { Receipt, LineItem, Customer, SellerProfile } from '@/lib/types';
import { promises as fsPromises, createWriteStream, WriteStream, accessSync, unlinkSync } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { format, parseISO } from 'date-fns';
import { logger } from '@/lib/services/logging';

const DATA_DIR = path.join(process.cwd(), 'src', 'lib', 'data');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs

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
                 // Use default built-in fonts by not specifying font here.
                 // PDFKit uses Helvetica by default.
                 // Avoids issues with finding external .afm files.
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
                await this.ensurePdfDirectoryExists();
                logger.debug(funcPrefix, `Creating write stream for ${this.filePath}`);
                this.stream = createWriteStream(this.filePath);

                this.stream.on('finish', () => {
                    logger.info(funcPrefix, 'PDF stream finished.');
                    this.success = true;
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

                this.doc.on('error', (err) => {
                    logger.error(funcPrefix, 'PDF document error during piping', err);
                    this.success = false;
                    this.stream?.close();
                    reject(new Error(`PDF document error: ${err.message}`));
                });

                logger.debug(funcPrefix, 'Piping PDF document to stream...');
                this.doc.pipe(this.stream);

            } catch (setupError) {
                 logger.error(funcPrefix, 'Error setting up PDF stream or piping', setupError);
                 reject(setupError);
            }
        });
    }

    private addHeader(isTaxInvoice: boolean): void {
        if (!this.doc) return;
        // Use default font, specify size and bold style (PDFKit handles this internally for standard fonts)
        this.doc.fontSize(20).text(isTaxInvoice ? 'TAX INVOICE' : 'INVOICE', { align: 'center', characterSpacing: 1 }); // Added spacing for emphasis
        this.doc.fontSize(10); // Revert size for subsequent text
        this.doc.moveDown();
    }

    private addSellerInfo(seller: SellerProfile): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addSellerInfo`;
         logger.debug(funcPrefix, 'Adding seller info');
         this.doc.fontSize(12).text('From:', { underline: false }); // Keep label slightly larger
         this.doc.fontSize(10); // Normal text for details
         this.doc.text(seller.name || 'Seller Name Missing', {continued: false}); // Ensure each text call starts on a new line if needed
         this.doc.text(seller.business_address || 'Seller Address Missing', {continued: false});
         this.doc.text(`ABN/ACN: ${seller.ABN_or_ACN || 'Seller ABN/ACN Missing'}`, {continued: false});
         this.doc.text(`Email: ${seller.contact_email || 'Seller Email Missing'}`, {continued: false});
         if (seller.phone) {
             this.doc.text(`Phone: ${seller.phone}`, {continued: false});
         }
         this.doc.moveDown();
    }

     private addCustomerInfo(customer: Omit<Customer, 'id'>): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addCustomerInfo`;
         logger.debug(funcPrefix, 'Adding customer info');
         this.doc.fontSize(12).text('To:', { underline: false });
         this.doc.fontSize(10);
         if (customer.customer_type === 'business') {
             this.doc.text(customer.business_name || 'Business Name Missing', {continued: false});
             if (customer.abn) {
                 this.doc.text(`ABN: ${customer.abn}`, {continued: false});
             }
             const contactName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
             if (contactName) {
                 this.doc.text(`Contact: ${contactName}`, {continued: false});
             }
         } else {
             const individualName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
             this.doc.text(individualName || 'Customer Name Missing', {continued: false});
         }
         this.doc.text(`Email: ${customer.email || 'N/A'}`, {continued: false});
         this.doc.text(`Phone: ${customer.phone || 'N/A'}`, {continued: false});
         this.doc.text(`Address: ${customer.address || 'N/A'}`, {continued: false});
         this.doc.moveDown();
     }

     private addInvoiceDetails(invoiceId: string, dateIsoString: string): void {
        if (!this.doc) return;
        const funcPrefix = `${this.logPrefix}:addInvoiceDetails`;
        logger.debug(funcPrefix, `Adding invoice details ID: ${invoiceId}, Date: ${dateIsoString}`);
        this.doc.fontSize(10);
        this.doc.text(`Invoice ID: ${invoiceId}`, {continued: false});
        try {
            const dateObject = parseISO(dateIsoString);
            if (isNaN(dateObject.getTime())) {
                throw new Error('Invalid date object after parsing');
            }
            const formattedDate = format(dateObject, 'dd/MM/yyyy');
            this.doc.text(`Date: ${formattedDate}`, {continued: false});
        } catch (e) {
            logger.warn(funcPrefix, `Could not parse or format date for PDF: ${dateIsoString}. Using original string.`, e);
            this.doc.text(`Date: ${dateIsoString}`, {continued: false});
        }
        this.doc.moveDown(1.5);
    }

    private drawTableHeader(includeGstColumn: boolean, y: number): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:drawTableHeader`;
         logger.debug(funcPrefix, `Drawing table header at Y=${y}`);
         const startX = this.doc.page.margins.left;
         const endX = this.doc.page.width - this.doc.page.margins.right;
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

         const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
         const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
         const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;

         const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10;
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
         const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
         const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
         const totalWidth = endX - effectiveTotalCol;

         this.doc.fontSize(10); // Using default font, potentially bolded by PDFKit for headers if standard
         // PDFKit might not support direct bolding without font switching for default fonts in all cases.
         // If bold is critical, switching back to Helvetica-Bold temporarily might be needed,
         // but we're avoiding explicit font files here. Text styling like underline is safer.
         this.doc.text('Item', itemCol, y, { width: itemWidth, underline: true });
         if (includeGstColumn) this.doc.text('GST?', gstCol, y, { width: gstWidth, underline: true, align: 'center' });
         this.doc.text('Qty', effectiveQtyCol, y, { width: qtyWidth, underline: true, align: 'right' });
         this.doc.text('Unit Price', effectivePriceCol, y, { width: priceWidth, underline: true, align: 'right' });
         this.doc.text('Line Total', effectiveTotalCol, y, { width: totalWidth, underline: true, align: 'right' });
         this.doc.moveDown(0.5);
         // No need to revert font if we didn't explicitly set it to bold
     }

     private addLineItemsTable(lineItems: LineItem[], includeGstColumn: boolean): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addLineItemsTable`;
         logger.debug(funcPrefix, `Adding ${lineItems.length} line items to table. Include GST Col: ${includeGstColumn}`);
         const tableTopInitial = this.doc.y;
         const startX = this.doc.page.margins.left;
         const endX = this.doc.page.width - this.doc.page.margins.right;
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

         const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
         const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
         const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;

         const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10;
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
         const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
         const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
         const totalWidth = endX - effectiveTotalCol;

         const tableBottomMargin = 70;
         const pageBottomLimit = this.doc.page.height - this.doc.page.margins.bottom - tableBottomMargin;

         this.drawTableHeader(includeGstColumn, tableTopInitial);
         let currentY = this.doc.y;

         lineItems.forEach((item, index) => {
             const itemNameText = `${item.product_name || 'N/A'}${item.description ? `\n(${item.description})` : ''}`;
             const itemHeightEstimate = this.doc!.heightOfString(itemNameText, { width: itemWidth, fontSize: 10 }) + 5;

             if (currentY + itemHeightEstimate > pageBottomLimit) {
                 logger.debug(funcPrefix, `Adding new page before item ${index + 1} at Y=${currentY}. Page bottom limit: ${pageBottomLimit}`);
                 this.doc!.addPage();
                 currentY = this.doc!.page.margins.top;
                 this.drawTableHeader(includeGstColumn, currentY);
                 currentY = this.doc!.y;
             }

             const unitPriceExGST = item.unit_price ?? 0;
             const lineTotalExGST = item.line_total ?? 0;

             this.doc!.fontSize(10);
             const rowStartY = currentY; // Remember start Y for alignment
             this.doc!.text(itemNameText, itemCol, rowStartY, { width: itemWidth });

             // Calculate Y position for right-aligned columns AFTER drawing the potentially multi-line item text
             const itemNameActualHeight = this.doc!.heightOfString(itemNameText, { width: itemWidth });
             const rightColumnsY = rowStartY; // Align to the start of the item text

             if (includeGstColumn) this.doc!.text(item.GST_applicable ? 'Yes' : 'No', gstCol, rightColumnsY, { width: gstWidth, align: 'center' });
             this.doc!.text(item.quantity?.toString() ?? '0', effectiveQtyCol, rightColumnsY, { width: qtyWidth, align: 'right' });
             this.doc!.text(`$${unitPriceExGST.toFixed(2)}`, effectivePriceCol, rightColumnsY, { width: priceWidth, align: 'right' });
             this.doc!.text(`$${lineTotalExGST.toFixed(2)}`, effectiveTotalCol, rightColumnsY, { width: totalWidth, align: 'right' });

             // Move Y down by the height of the tallest element in the row (the item name) plus gap
             currentY = rowStartY + itemNameActualHeight + 3;
             this.doc!.y = currentY; // Sync the document's internal Y position
         });

         this.doc!.moveDown(0.5);

         logger.debug(funcPrefix, `Drawing separator line before totals at Y=${this.doc!.y}`);
         this.doc!.moveTo(startX, this.doc!.y).lineTo(endX, this.doc!.y).strokeColor('#cccccc').stroke();
         this.doc!.moveDown(0.5);
     }

     private addTotals(subtotal: number, gstAmount: number, total: number): void {
         if (!this.doc) return;
         const funcPrefix = `${this.logPrefix}:addTotals`;
         logger.debug(funcPrefix, `Adding totals: Sub=${subtotal}, GST=${gstAmount}, Total=${total}`);
         const totalsX = 400;
         const labelX = this.doc.page.margins.left;
         const endX = this.doc.page.width - this.doc.page.margins.right;
         let totalsY = this.doc.y;

         const pageBottom = this.doc.page.height - this.doc.page.margins.bottom - 20;
         const totalsHeightEstimate = 60;

         if (totalsY + totalsHeightEstimate > pageBottom) {
             logger.debug(funcPrefix, `Adding new page before totals section at Y=${totalsY}. Page bottom limit: ${pageBottom}`);
             this.doc.addPage();
             totalsY = this.doc.page.margins.top;
             this.doc.y = totalsY;
         }

         this.doc.fontSize(10);
         const amountWidth = endX - totalsX;

         // Subtotal
         this.doc.text(`Subtotal (ex GST):`, labelX, totalsY, { continued: false, align: 'left' });
         this.doc.text(`$${subtotal.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth });
         totalsY = this.doc.y + 2;

         // GST Amount (only if applicable)
         if (gstAmount > 0) {
            this.doc.text(`GST Amount (10%):`, labelX, totalsY, { continued: false, align: 'left' });
            this.doc.text(`$${gstAmount.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth });
            totalsY = this.doc.y + 2;
         }

         // Draw Separator Line before the final total
         const lineY = totalsY + 5;
         logger.debug(funcPrefix, `Drawing separator line for totals at Y=${lineY}`);
         this.doc.moveTo(totalsX - 10, lineY).lineTo(endX, lineY).strokeColor('#aaaaaa').stroke();
         totalsY = lineY + 5;
         this.doc.y = totalsY;

         // Total Amount (slightly larger, maybe bold if default font supports it well)
         this.doc.fontSize(12);
         this.doc.text(`Total Amount:`, labelX, totalsY, { continued: false, align: 'left'});
         this.doc.text(`$${total.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth });
         totalsY = this.doc.y;

         // Revert font settings
         this.doc.fontSize(10);
         this.doc.y = totalsY;
         this.doc.moveDown();
     }

    private async finalize(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:finalize`;
        return new Promise((resolve, reject) => {
            if (!this.doc || !this.stream) {
                 const errorMsg = !this.doc ? "Document not initialized." : "Stream not initialized.";
                 logger.error(funcPrefix, `Finalize called prematurely. ${errorMsg}`);
                 return reject(new Error(errorMsg));
            }

             const streamFinishPromise = new Promise<void>((res, rej) => {
                 this.stream!.once('finish', () => { logger.debug(funcPrefix, 'Stream finished.'); res(); });
                 this.stream!.once('error', (err) => { logger.error(funcPrefix, 'Stream error.', err); rej(err); });
                 this.doc!.once('error', (err) => { logger.error(funcPrefix, 'Document error.', err); rej(err); });
             });

            logger.info(funcPrefix, 'Finalizing PDF document (calling end())...');
            this.doc.end();

             streamFinishPromise
                 .then(() => {
                     logger.info(funcPrefix, 'Stream finished successfully during finalize.');
                     this.success = true;
                     resolve();
                 })
                 .catch((err) => {
                     logger.error(funcPrefix, 'Stream or document error caught during finalize', err);
                     this.success = false;
                     reject(err);
                 });
        });
    }

    private async cleanupFailedPdf(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:cleanupFailedPdf`;
        if (!this.filePath) {
            logger.debug(funcPrefix, "Cleanup called without a file path.");
            return;
        }
        logger.warn(funcPrefix, `Attempting cleanup for: ${this.filePath}`);
        try {
            if (this.stream && !this.stream.closed && this.stream.writable) {
                logger.debug(funcPrefix, 'Closing potentially open write stream...');
                await new Promise<void>((resolve) => {
                     this.stream!.once('close', resolve);
                     this.stream!.once('error', (err) => { logger.error(funcPrefix, 'Error closing stream during cleanup', err); resolve(); });
                     this.stream!.end();
                 });
                 logger.debug(funcPrefix, 'Finished waiting for stream close/error.');
            } else {
                logger.debug(funcPrefix, 'No active/writable stream to close or already closed.');
            }

            logger.debug(funcPrefix, `Checking existence of potentially incomplete PDF: ${this.filePath}`);
             try {
                 accessSync(this.filePath); // Use sync version here for simplicity in cleanup
                 logger.warn(funcPrefix, `Attempting to delete incomplete/corrupted PDF: ${this.filePath}`);
                 unlinkSync(this.filePath); // Use sync version
                 logger.info(funcPrefix, `Deleted incomplete/corrupted PDF: ${this.filePath}`);
             } catch (accessOrUnlinkError: any) {
                 if (accessOrUnlinkError.code === 'ENOENT') {
                     logger.info(funcPrefix, `Incomplete PDF ${this.filePath} did not exist, no need to delete.`);
                 } else {
                     logger.error(funcPrefix, 'Error accessing or deleting potentially corrupted PDF during cleanup', accessOrUnlinkError);
                 }
             }
        } catch (cleanupError) {
            logger.error(funcPrefix, 'Error during PDF cleanup process itself', cleanupError);
        } finally {
             this.doc = null;
             this.stream = null;
             // Maybe keep filePath and logPrefix for reporting? For now, reset fully.
             // this.filePath = '';
             // this.logPrefix = '';
        }
    }

    public async generate(receipt: Receipt, operationId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
        try {
            this.initialize(receipt.receipt_id, operationId);
        } catch(initError: any) {
             logger.error(this.logPrefix || `[${operationId} PDFKit ${receipt?.receipt_id || 'unknown'}]`, 'ERROR during PDF initialization', initError);
             return { success: false, message: initError.message || "PDF initialization failed." };
        }

        try {
            await this.setupStream();

            logger.debug(this.logPrefix, 'Adding content to PDF...');
            this.addHeader(receipt.is_tax_invoice);
            this.addSellerInfo(receipt.seller_profile_snapshot);
            this.addCustomerInfo(receipt.customer_snapshot);
            this.addInvoiceDetails(receipt.receipt_id, receipt.date_of_purchase);
            this.addLineItemsTable(receipt.line_items, receipt.GST_amount > 0);
            this.addTotals(receipt.subtotal_excl_GST, receipt.GST_amount, receipt.total_inc_GST);

            await this.finalize();

            logger.info(this.logPrefix, `PDF generation process completed. Success flag: ${this.success}`);
            if (!this.success) {
                throw new Error("Stream finished or errored, but success flag was not set correctly.");
            }
            logger.info(this.logPrefix, 'PDF generation successful.');
            const finalFilePath = this.filePath;
             this.doc = null;
             this.stream = null;
             this.filePath = '';
            return { success: true, filePath: finalFilePath };

        } catch (error: any) {
            logger.error(this.logPrefix, 'ERROR during PDF generation orchestration', error);
            await this.cleanupFailedPdf();

            let message = `Failed to generate PDF: ${error.message || 'Unknown error'}`;
            // Check for potential font-related errors (though less likely now)
             if (error.message?.includes('ENOENT') && error.message?.includes('.afm')) {
                 message = `Failed to generate PDF: Missing font file (${error.message}). Please ensure standard fonts are available.`;
                 logger.error(this.logPrefix, "Font file missing error detected.", error);
             }

            return { success: false, message };
        }
    }
}
