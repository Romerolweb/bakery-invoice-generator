// src/lib/services/pdfGenerator.ts
// REMOVED 'use server'; directive as this file exports a class, not Server Action functions.

import type { Receipt, LineItem, Customer, SellerProfile } from '@/lib/types';
import { promises as fsPromises, createWriteStream, accessSync, unlinkSync } from 'fs';
import type { WriteStream, PathLike } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { format, parseISO } from 'date-fns';
import { logger } from '@/lib/services/logging'; // Import the logger

const DATA_DIR = path.join(process.cwd(), 'src/lib/data');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs
const FONTS_DIR = path.join(process.cwd(), 'src/lib/fonts'); // Directory for bundled fonts

// ** IMPORTANT USER ACTION REQUIRED **
// Copy the following files from `node_modules/pdfkit/js/data/`
// into `src/lib/fonts/`:
// - Helvetica.afm
// - Helvetica-Bold.afm
// - Helvetica-Oblique.afm
// - Helvetica-BoldOblique.afm
// This is necessary because Next.js server environments might not resolve
// the default font paths correctly, leading to ENOENT errors.

const HELVETICA_PATH = path.join(FONTS_DIR, 'Helvetica.afm');
const HELVETICA_BOLD_PATH = path.join(FONTS_DIR, 'Helvetica-Bold.afm');
// const HELVETICA_OBLIQUE_PATH = path.join(FONTS_DIR, 'Helvetica-Oblique.afm');
// const HELVETICA_BOLD_OBLIQUE_PATH = path.join(FONTS_DIR, 'Helvetica-BoldOblique.afm');


/**
 * PdfGenerator Service
 *
 * Architecture: This class encapsulates the logic for generating PDF invoices using the `pdfkit` library.
 * It follows a Service pattern, isolating PDF generation complexity from the main application logic (Server Actions).
 *
 * Design Pattern: The `generate` method orchestrates the PDF creation process by calling private helper methods
 * for each section (header, seller info, customer info, etc.). This improves modularity and readability.
 * Error handling is included, attempting cleanup of failed PDF files.
 *
 * Font Handling: Due to issues with `pdfkit` finding default fonts in Next.js server environments (RSC/Actions),
 * this service requires standard Helvetica fonts (.afm files) to be manually copied into `src/lib/fonts`.
 * Font paths are explicitly used in `doc.font()` calls.
 */
export class PdfGenerator {
    private _doc: PDFKit.PDFDocument | null = null;
    private _filePath: string = '';
    private _logPrefix: string = '';
    private _success: boolean = false;
    private static isGenerating: boolean = false; // Lock mechanism for concurrency
    private _operationId: string = ''; // To correlate logs

    // Define standard font paths for easy reference
    private _helveticaPath: string = HELVETICA_PATH;
    private _helveticaBoldPath: PathLike = HELVETICA_BOLD_PATH;

    // Ensure the PDF directory exists
    private async _ensurePdfDirectoryExists(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_ensurePdfDirectoryExists`;
        try {
 await fsPromises.mkdir(PDF_DIR, { recursive: true }) ;
            logger.debug(funcPrefix, `PDF directory ensured: ${PDF_DIR}`);
        } catch (error) {
            logger.error(funcPrefix, 'FATAL: Error creating PDF directory:', error);
            throw new Error(`Failed to ensure PDF directory exists: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

     // Check if required font files exist
    private _checkRequiredFontsExist(): void {
        const funcPrefix = `${this._logPrefix}:_checkRequiredFontsExist`;
        const requiredFonts: PathLike[] = [this._helveticaPath, this._helveticaBoldPath];
        const missingFonts = [];
        for (const fontPath of requiredFonts) {
            try {
                accessSync(fontPath); // Check if file exists and is readable
                logger.debug(funcPrefix, `Font found: ${fontPath}`);
            } catch (err: any) {
                if (err.code === 'ENOENT') { // Change this line
                    logger.error(funcPrefix, `Required font file missing: ${fontPath}`);
                    missingFonts.push(path.basename(fontPath));
                } else { // Change this line
                     logger.error(funcPrefix, `Error accessing font file ${fontPath}`, err);
                     // Treat access errors other than ENOENT as potentially critical
                     throw new Error(`Error accessing required font file ${path.basename(fontPath)}: ${err.message}`);
                }
            }
        }
        if (missingFonts.length > 0) {
            const errorMsg = `Required font file(s) missing in src/lib/fonts/: ${missingFonts.join(', ')}. Please copy them from node_modules/pdfkit/js/data/.`;
            logger.error(funcPrefix, errorMsg);
            throw new Error(errorMsg); // Throw to stop PDF generation
        }
        logger.info(funcPrefix, 'All required fonts found.');
    }


    private _initialize(receiptId: string, operationId: string): void {
        this._operationId = operationId;
        this._logPrefix = `[${operationId} PDF ${receiptId}]`;
        this._filePath = path.join(PDF_DIR, `${receiptId}.pdf`);
        logger.info(this._logPrefix, `Initializing PDF generation for path: ${this._filePath}`);

        try {
            // Check for fonts *before* initializing PDFDocument
             this._checkRequiredFontsExist();

            this._doc = new PDFDocument({
                 margin: 50,
                 bufferPages: true ,
                 // font: this._helveticaPath, // Set default font path - might not always work as expected, explicit calls are safer
            });
             logger.debug(this._logPrefix, `PDFDocument instantiated successfully.`);
        } catch (initError) {
            logger.error(this._logPrefix, `FATAL: Error initializing PDF Generator:`, initError);
            // Rethrow or handle specific errors (like font missing error)
            throw new Error(`PDF library initialization error: ${initError instanceof Error ? initError.message : String(initError)}`);
        }
        this._success = false; // Reset success flag
    }

    // Sets up the write stream for the PDF document.
    private async _setupStream(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_setupStream`;
        return new Promise(async (resolve, reject) => {
            try {
                await this._ensurePdfDirectoryExists(); // Ensure directory exists right before creating the stream
                logger.debug(funcPrefix, `Creating write stream for ${this._filePath}`);
                this._stream = createWriteStream(this._filePath);

                this._stream.on('finish', () => {
                    logger.info(funcPrefix, 'PDF stream finished.');
                    this._success = true; // Mark success on finish
                    resolve();
                });

                this._stream.on('error', (err) => {
                    logger.error(funcPrefix, 'PDF stream error:', err);
                    this._success = false;
                    reject(new Error(`PDF stream error: ${err.message}`));
                });

                if (!this._doc) {
                    reject(new Error("PDF Document not initialized before setting up stream."));
 return;
                }

                this._doc.on('error', (err) => {
                    logger.error(funcPrefix, 'PDF document error during piping', err);
                    this._success = false;
                    reject(new Error(`PDF document error: ${err.message}`));
                });

                logger.debug(funcPrefix, 'Piping PDF document to stream...');
                this._doc.pipe(this._stream);

            } catch (setupError) {
                 logger.error(funcPrefix, 'Error setting up PDF stream or piping:', setupError);
                 reject(setupError); // Reject the promise on setup error
            }
        });
    }

    // Adds the main header to the PDF.
    private _addHeader(isTaxInvoice: boolean): void {
        if (!this._doc) return;
        // Explicitly set font path
 this._doc.fontSize(20).font(this._helveticaBoldPath).text(isTaxInvoice ? 'TAX INVOICE' : 'INVOICE', { align: 'center' }) ;
        this._doc.font(this._helveticaPath).fontSize(10); // Revert to regular font path
        this._doc.moveDown();
    }

    private _addSellerInfo(seller: SellerProfile): void {
         if (!this._doc) return;
         const funcPrefix = `${this._logPrefix}:_addSellerInfo`;
         logger.debug(funcPrefix, 'Adding seller info');
         this._doc.fontSize(12).font(this._helveticaBoldPath).text('From:', { underline: false }); // Bold label
 this._doc.font(this._helveticaPath).fontSize(10) ; // Normal text for details
         this._doc.text(seller.name ?? 'Seller Name Missing');
         this._doc.text(seller.business_address ?? 'Seller Address Missing');
         this._doc.text(`ABN/ACN: ${seller.ABN_or_ACN ?? 'Seller ABN/ACN Missing'}`);
         this._doc.text(`Email: ${seller.contact_email ?? 'Seller Email Missing'}`);
         if (seller.phone) {
             this._doc.text(`Phone: ${seller.phone}`);
         }
         this._doc.moveDown();
    }

    // Adds customer information to the PDF.
     private _addCustomerInfo(customer: Omit<Customer, 'id'>): void {
         if (!this._doc) return;
         const funcPrefix = `${this._logPrefix}:_addCustomerInfo`;
         logger.debug(funcPrefix, 'Adding customer info');
         this._doc.fontSize(12).font(this._helveticaBoldPath).text('To:', { underline: false }); // Bold label
         this._doc.font(this._helveticaPath).fontSize(10); // Normal text for details
         if (customer.customer_type === 'business') {
 this._doc.text(customer.business_name ?? 'Business Name Missing');
             if (customer.abn) {
                 this._doc.text(`ABN: ${customer.abn}`);
             }
             const contactName = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();
             if (contactName) {
                 this._doc.text(`Contact: ${contactName}`);
             }
         } else {
             const individualName = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();
             this._doc.text(individualName || 'Customer Name Missing');
         }

         this._doc.text(`Email: ${customer.email || 'N/A'}`);
         this._doc.text(`Phone: ${customer.phone || 'N/A'}`);
         this._doc.text(`Address: ${customer.address || 'N/A'}`);
         this._doc.moveDown();
     }

     private _addInvoiceDetails(invoiceId: string, dateIsoString: string): void {

        if (!this._doc) return;
        const funcPrefix = `${this._logPrefix}:_addInvoiceDetails`;
        logger.debug(funcPrefix, `Adding invoice details ID: ${invoiceId}, Date: ${dateIsoString}`);
        this._doc.font(this._helveticaPath).fontSize(10); // Ensure correct font
        this._doc.text(`Invoice ID: ${invoiceId}`);
        try {
            const dateObject = parseISO(dateIsoString);
            if (isNaN(dateObject.getTime())) {
                throw new Error('Invalid date object after parsing');
            }
            const formattedDate = format(dateObject, 'dd/MM/yyyy');
            this._doc.text(`Date: ${formattedDate}`);
        } catch (e) {
            logger.warn(funcPrefix, `Could not parse or format date for PDF: ${dateIsoString}`, e);
            this._doc.text(`Date: ${dateIsoString}`); // Fallback to ISO string
        }
        this._doc.moveDown(1.5); // More space before table
    }

    // Draws the header row for the line items table.
    private _drawTableHeader(includeGstColumn: boolean, y: number): void {
         if (!this._doc) return;
         const funcPrefix = `${this._logPrefix}:_drawTableHeader`;
         logger.debug(funcPrefix, `Drawing table header at Y=${y}`);
         const startX = this._doc.page.margins.left;
         const endX = this._doc.page.width - this._doc.page.margins.right;
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

         // Adjust columns if GST is not included
         const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
         const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
         const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;


         const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10;
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
         const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
         const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
         const totalWidth = endX - effectiveTotalCol;

         this._doc.fontSize(10).font(this._helveticaBoldPath); // Ensure bold font path
 this._doc.text('Item', itemCol, y, { width: itemWidth, underline: true }) ;
         if (includeGstColumn) this._doc.text('GST?', gstCol, y, { width: gstWidth, underline: true, align: 'center' }) ;
         this._doc.text('Qty', effectiveQtyCol, y, { width: qtyWidth, underline: true, align: 'right' }) ;
         this._doc.text('Unit Price', effectivePriceCol, y, { width: priceWidth, underline: true, align: 'right' }) ;
         this._doc.text('Line Total', effectiveTotalCol, y, { width: totalWidth, underline: true, align: 'right' }) ;
         this._doc.moveDown(0.5);
         this._doc.font(this._helveticaPath); // Revert font path

     }

     private _addLineItemsTable(lineItems: LineItem[], includeGstColumn: boolean): void {
         if (!this._doc) return;
         const funcPrefix = `${this._logPrefix}:_addLineItemsTable`;
         logger.debug(funcPrefix, `Adding ${lineItems.length} line items to table. Include GST Col: ${includeGstColumn}`);
         const tableTopInitial = this._doc.y;
         const startX = this._doc.page.margins.left;
         const endX = this._doc.page.width - this._doc.page.margins.right;
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

        // Adjust columns if GST is not included
         const effectiveQtyCol = includeGstColumn ? qtyCol : gstCol;
         const effectivePriceCol = includeGstColumn ? priceCol : qtyCol;
         const effectiveTotalCol = includeGstColumn ? totalCol : priceCol;

         const itemWidth = (includeGstColumn ? gstCol : effectiveQtyCol) - itemCol - 10;
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
         const qtyWidth = effectivePriceCol - effectiveQtyCol - 10;
         const priceWidth = effectiveTotalCol - effectivePriceCol - 10;
         const totalWidth = endX - effectiveTotalCol;


         const tableBottomMargin = 70; // Space needed for totals + buffer
         const pageBottom = this._doc.page.height - this._doc.page.margins.bottom - tableBottomMargin;

         this._drawTableHeader(includeGstColumn, tableTopInitial);
         let currentY = this._doc.y;

         lineItems.forEach((item, index) => {
             // Estimate row height - important to use the current font
             const itemHeightEstimate = this._doc!.font(this._helveticaPath).fontSize(10).heightOfString('X', { width: itemWidth }) + 5;

             if (currentY + itemHeightEstimate > pageBottom) {
                 logger.debug(funcPrefix, `Adding new page before item ${index + 1} at Y=${currentY}. Page bottom limit: ${pageBottom}`);
                 this._doc!.addPage();
                 currentY = this._doc!.page.margins.top; // Reset Y to top margin
                 this._drawTableHeader(includeGstColumn, currentY);
                 currentY = this._doc!.y; // Get Y position after header
             }

             const unitPriceExGST = item.unit_price ?? 0;
             const lineTotalExGST = item.line_total ?? 0;

             // Draw row content - ensure font is set correctly before drawing text
             this._doc!.font(this._helveticaPath).fontSize(10);
 this._doc!.text(item.product_name ?? 'N/A', itemCol, currentY, { width: itemWidth }) ;
             if (includeGstColumn) this._doc!.text(item.GST_applicable ? 'Yes' : 'No', gstCol, currentY, { width: gstWidth, align: 'center' }) ;
             this._doc!.text(item.quantity?.toString() ?? '0', effectiveQtyCol, currentY, { width: qtyWidth, align: 'right' }) ;
             this._doc!.text(`$${unitPriceExGST.toFixed(2)}`, effectivePriceCol, currentY, { width: priceWidth, align: 'right' }) ;
 this._doc!.text(`$${lineTotalExGST.toFixed(2)}`, effectiveTotalCol, currentY, { width: totalWidth, align: 'right' }) ;

             // Determine the actual height of the row based on the tallest element (usually item name)
              const actualHeight = this._doc!.heightOfString(item.product_name || 'N/A', { width: itemWidth });
              currentY += actualHeight + 3; // Move Y down by height + small gap
              this._doc!.y = currentY; // Sync doc's Y position

         });

         this._doc!.moveDown(0.5); // Add a bit more space before the separator line

         // Draw a line before totals
         logger.debug(funcPrefix, `Drawing separator line before totals at Y=${this._doc!.y}`);
         this._doc!.moveTo(startX, this._doc!.y).lineTo(endX, this._doc!.y).strokeColor('#cccccc').stroke();
         this._doc!.moveDown(0.5);
     }

    // Adds the summary section with subtotal, GST, and total.
     private _addTotals(subtotal: number, gstAmount: number, total: number): void {
         if (!this._doc) return;
         const funcPrefix = `${this._logPrefix}:_addTotals`;
         logger.debug(funcPrefix, `Adding totals: Sub=${subtotal}, GST=${gstAmount}, Total=${total}`);
         const totalsX = 400; // Starting X for amount values
         const labelX = this._doc.page.margins.left; // Starting X for labels
         const endX = this._doc.page.width - this._doc.page.margins.right; // Right edge for alignment
         let totalsY = this._doc.y; // Start position for totals

         const pageBottom = this._doc.page.height - this._doc.page.margins.bottom - 20;
         const totalsHeightEstimate = 60; // Estimate height needed for totals

         // Check if totals fit on the current page
         if (totalsY + totalsHeightEstimate > pageBottom) {
             logger.debug(funcPrefix, `Adding new page before totals section at Y=${totalsY}. Page bottom limit: ${pageBottom}`);
             this._doc.addPage();
             totalsY = this._doc.page.margins.top; // Reset Y position for the new page
             this._doc.y = totalsY; // Set doc's current Y
         }

         // Use consistent font and size for labels and amounts initially
         this._doc.fontSize(10).font(this._helveticaPath); // Ensure correct font path
         const amountWidth = endX - totalsX;

         // Subtotal
         this._doc.text(`Subtotal (ex GST):`, labelX, totalsY, { continued: false, align: 'left' });
 this._doc.text(`$${subtotal.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth }) ;
         totalsY = this._doc.y + 2; // Add small gap after line

         // GST Amount (only show if GST > 0)
         if (gstAmount > 0) {
            this._doc.text(`GST Amount (10%):`, labelX, totalsY, { continued: false, align: 'left' });
 this._doc.text(`$${gstAmount.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth }) ;
            totalsY = this._doc.y + 2; // Add small gap after line
         }


         // Draw separator line
         const lineY = totalsY + 5;
         logger.debug(funcPrefix, `Drawing separator line for totals at Y=${lineY}`);
         this._doc.moveTo(totalsX - 50, lineY).lineTo(endX, lineY).strokeColor('#aaaaaa').stroke();
         totalsY = lineY + 5; // Move current position below the line
         this._doc.y = totalsY;

         // Total - Make it bold and slightly larger
         this._doc.font(this._helveticaBoldPath).fontSize(12); // Use bold font path
         this._doc.text(`Total Amount:`, labelX, totalsY, { continued: false, align: 'left'}); // Changed label slightly
 this._doc.text(`$${total.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: amountWidth }) ;
         totalsY = this._doc.y; // Update Y after text

         // Revert font settings
         this._doc.font(this._helveticaPath).fontSize(10); // Revert to regular font path
         this._doc.y = totalsY; // Ensure doc.y is at the end of the totals block
         this._doc.moveDown();
     }


    // Finalizes the PDF document and waits for the stream to finish.
    private async _finalize(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_finalize`;
        return new Promise((resolve, reject) => {
            if (!this._doc || !this._stream) {
                 const errorMsg = !this._doc ? "Document not initialized." : "Stream not initialized.";
                 logger.error(funcPrefix, `Finalize called prematurely. ${errorMsg}`);
                 return reject(new Error(errorMsg));
            }

             const streamFinishPromise = new Promise<void>((res, rej) => {
                 this._stream!.once('finish', res);
                 this._stream!.once('error', rej);
                 this._doc!.once('error', rej);
             });

            logger.info(funcPrefix, 'Finalizing PDF document (calling end())...');
            this._doc.end(); // Trigger finish/error events

             streamFinishPromise
                 .then(() => {
                     logger.info(funcPrefix, 'Stream finished successfully during finalize.');
                     this._success = true; // Confirm success
                     resolve();
                 })
                 .catch((err) => {
                     logger.error(funcPrefix, 'Stream or document error during finalize:', err);
                      this._success = false;
                     reject(err);
                 });
        });
    }

    // Cleans up the incomplete PDF file in case of an error during generation.
    private async _cleanupFailedPdf(): Promise<void> {
        const funcPrefix = `${this._logPrefix || `[${this._operationId} PDF ${path.basename(this._filePath, '.pdf') || 'unknown'}]`}:_cleanupFailedPdf`;
        if (!this._filePath) {
            logger.debug(funcPrefix, "Cleanup called without a file path, likely initialization failed early.");
            return;
        }
        logger.debug(funcPrefix, `Attempting cleanup for: ${this._filePath}`);
        try {
            // Attempt to delete the file
            logger.debug(funcPrefix, `Checking existence of potentially incomplete PDF: ${this._filePath}`);
             try {
                 await fsPromises.access(this._filePath); // Use async access check
                 logger.warn(funcPrefix, `Attempting to delete incomplete/corrupted PDF: ${this._filePath}`);
                 await fsPromises.unlink(this._filePath); // Use async unlink
                 logger.info(funcPrefix, `Deleted incomplete/corrupted PDF: ${this._filePath}`);
             } catch (accessOrUnlinkError: any) {
                 if (accessOrUnlinkError.code === 'ENOENT') {
                     logger.info(funcPrefix, `Incomplete PDF ${this._filePath} did not exist, no need to delete.`);
                 } else {
                     logger.error(funcPrefix, 'Error accessing or deleting potentially corrupted PDF during cleanup:', accessOrUnlinkError);
                 }
             }
        } catch (cleanupError) {
            logger.error(funcPrefix, 'Error during PDF cleanup process itself:', cleanupError as any);
        } finally {
            this._doc = null;
    }

    // Public method to generate the PDF. This can be called by a Server Action.
 async generate(receipt: Receipt, operationId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
        if (PdfGenerator.isGenerating) { // Check lock
             logger.warn(`[${operationId} PDF ${receipt?.receipt_id || 'unknown'}]`, 'PDF generation is already in progress. Rejecting concurrent request.');
             return { success: false, message: "Another PDF generation is currently in progress. Please try again shortly." };
        }

        PdfGenerator.isGenerating = true; // Acquire lock
        try {
            this._initialize(receipt.receipt_id, operationId);
        } catch(initError: any) {
             logger.error(this._logPrefix || `[${operationId} PDF ${receipt?.receipt_id || 'unknown'}]`, 'ERROR during PDF initialization:', initError);
             return { success: false, message: initError.message || "PDF initialization failed." };
        }

        try {
            await this._setupStream();

            // --- Add Content ---
            logger.debug(this._logPrefix, 'Adding content to PDF...');
            this._addHeader(receipt.is_tax_invoice);
            this._addSellerInfo(receipt.seller_profile_snapshot);
            this._addCustomerInfo(receipt.customer_snapshot);
            this._addInvoiceDetails(receipt.receipt_id, receipt.date_of_purchase);
            this._addLineItemsTable(receipt.line_items, receipt.GST_amount > 0);
            this._addTotals(receipt.subtotal_excl_GST, receipt.GST_amount, receipt.total_inc_GST);

            // --- Finalize Document ---
            await this._finalize();

            logger.info(this._logPrefix, `PDF generation process completed. Success flag: ${this._success}`);
            if (!this._success) {
                 // If finalize resolved but success is false, it means an error occurred during streaming/piping
                 throw new Error("PDF generation failed: An error occurred during stream processing or finalization.");
            }
            logger.info(this._logPrefix, 'PDF generation successful.');
            const finalFilePath = this._filePath; // Store before potential cleanup resets it
             // Reset internal state for potential reuse
             this._filePath = '';
            return { success: true, filePath: finalFilePath };
        } finally {
            PdfGenerator.isGenerating = false; // Release lock regardless of success or failure

        } catch (error: any) {
            logger.error(this._logPrefix || `[${operationId} PDF ${receipt?.receipt_id || 'unknown'}]`, 'ERROR during PDF generation orchestration:', error);
            await this._cleanupFailedPdf(); // Ensure cleanup happens

            let message = `Failed to generate PDF: ${error.message || 'Unknown error'}`;
            // Check specifically for font errors originating from the library or our checks
            if (error.message?.includes('font') && error.message?.includes('missing')) {
                 message = error.message; // Use the specific font error message
            } else if (error.message?.includes('ENOENT') && error.message?.includes('.afm')) {
                 // Catch potential lingering default font path errors (should be less likely now)
                 message = `Failed to generate PDF: Could not find required font metric file (.afm). Ensure fonts are in src/lib/fonts/. Details: ${error.message}`;
            }

            PdfGenerator.isGenerating = false; // Release lock on error
            return { success: false, message };
        }
    }
}

