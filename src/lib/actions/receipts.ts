// src/lib/actions/receipts.ts
'use server';

import type { Receipt, LineItem, Customer, Product, SellerProfile } from '@/lib/types';
import { promises as fsPromises, createWriteStream, accessSync, unlinkSync } from 'fs'; // Import fs functions
import type { WriteStream } from 'fs'; // Import WriteStream type
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { getCustomerById } from './customers';
import { getProductById } from './products';
import { getSellerProfile } from './seller';
import { format, parseISO } from 'date-fns';
import { logger } from '@/lib/services/logging'; // Import the logger

const LOG_PREFIX = 'ReceiptsAction';

const DATA_DIR = path.join(process.cwd(), 'src/lib/data');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs

// --- Helper Functions ---

// Ensure necessary directories exist
async function ensureDirectoriesExist() {
    const funcPrefix = `${LOG_PREFIX}:ensureDirectoriesExist`;
    try {
        logger.debug(funcPrefix, `Ensuring data directory exists: ${DATA_DIR}`);
        await fsPromises.mkdir(DATA_DIR, { recursive: true });
        logger.debug(funcPrefix, `Ensuring PDF directory exists: ${PDF_DIR}`);
        await fsPromises.mkdir(PDF_DIR, { recursive: true });
        logger.debug(funcPrefix, 'Data directories ensured successfully.');
    } catch (error) {
        logger.error(funcPrefix, 'FATAL: Error creating data/PDF directories', error);
        throw new Error(`Failed to ensure data directories exist: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read receipts data
export async function readReceipts(): Promise<Receipt[]> {
  const funcPrefix = `${LOG_PREFIX}:readReceipts`;
  let fileContent;
  try {
    logger.debug(funcPrefix, `Attempting to ensure directories before reading receipts...`);
    await ensureDirectoriesExist(); // Ensure directory exists before reading
    logger.debug(funcPrefix, `Attempting to read receipts file: ${RECEIPTS_FILE}`);
    fileContent = await fsPromises.readFile(RECEIPTS_FILE, 'utf-8');
    const receipts = JSON.parse(fileContent);
    logger.info(funcPrefix, `Successfully read and parsed ${receipts.length} receipts.`);
    return receipts;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn(funcPrefix, `Receipts file (${RECEIPTS_FILE}) not found, returning empty array.`);
      return [];
    } else if (error instanceof SyntaxError) {
        logger.error(funcPrefix, `Error parsing JSON from ${RECEIPTS_FILE}. Content: "${fileContent ? fileContent.substring(0,100)+'...' : 'empty'}"`, error);
        throw new Error(`Could not parse receipts data: Invalid JSON format.`);
    }
    logger.error(funcPrefix, `Error reading receipts file (${RECEIPTS_FILE})`, error);
    throw new Error(`Could not load receipts: ${error.message}`);
  }
}

// Helper function to write receipts data
export async function writeReceipts(receipts: Receipt[]): Promise<void> {
  const funcPrefix = `${LOG_PREFIX}:writeReceipts`;
  try {
    logger.debug(funcPrefix, `Attempting to ensure directories before writing receipts...`);
    await ensureDirectoriesExist(); // Ensure directory exists before writing
    const dataToWrite = JSON.stringify(receipts, null, 2);
    logger.debug(funcPrefix, `Attempting to write ${receipts.length} receipts to file: ${RECEIPTS_FILE}`);
    await fsPromises.writeFile(RECEIPTS_FILE, dataToWrite, 'utf-8');
    logger.info(funcPrefix, `Successfully wrote receipts data.`);
  } catch (error: any) {
    logger.error(funcPrefix, `Error writing receipts file (${RECEIPTS_FILE})`, error);
    throw new Error(`Failed to save receipts: ${error.message}`);
  }
}

// --- PDF Generation Service (Internal Module) ---
// This encapsulates all PDF-specific logic

const PdfGenerator = {
    _doc: null as PDFKit.PDFDocument | null,
    _stream: null as WriteStream | null,
    _filePath: '' as string,
    _logPrefix: '' as string,
    _success: false as boolean,

    _initialize(receiptId: string, operationId: string): void {
        this._logPrefix = `[${operationId} PDF ${receiptId}]`;
        this._filePath = path.join(PDF_DIR, `${receiptId}.pdf`);
        logger.info(this._logPrefix, `Initializing PDF generation for path: ${this._filePath}`);
        try {
            this._doc = new PDFDocument({
                 margin: 50,
                 bufferPages: true, // Important for handling page breaks correctly
                 // font: 'Helvetica' // REMOVED: Rely on default Helvetica
            });
             logger.debug(this._logPrefix, `PDFDocument instantiated successfully.`);
        } catch (instantiationError) {
            logger.error(this._logPrefix, `FATAL: Error instantiating PDFDocument`, instantiationError);
             // Re-throw a more specific error to be caught by the generate method
             throw new Error(`PDF library initialization error: ${instantiationError instanceof Error ? instantiationError.message : String(instantiationError)}`);
        }
        this._success = false; // Reset success flag
    },

    async _setupStream(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_setupStream`;
        return new Promise(async (resolve, reject) => {
            try {
                // Ensure directory exists right before creating the stream
                await ensureDirectoriesExist();
                logger.debug(funcPrefix, `Creating write stream for ${this._filePath}`);
                this._stream = createWriteStream(this._filePath);

                this._stream.on('finish', () => {
                    logger.info(funcPrefix, 'PDF stream finished.');
                    this._success = true; // Mark success on finish
                    resolve();
                });

                this._stream.on('error', (err) => {
                    logger.error(funcPrefix, 'PDF stream error', err);
                    this._success = false;
                    reject(new Error(`PDF stream error: ${err.message}`));
                });

                 this._doc!.on('error', (err) => {
                    logger.error(funcPrefix, 'PDF document error', err);
                    this._success = false;
                    reject(new Error(`PDF document error: ${err.message}`));
                });

                logger.debug(funcPrefix, 'Piping PDF document to stream...');
                this._doc!.pipe(this._stream);

            } catch (setupError) {
                 logger.error(funcPrefix, 'Error setting up PDF stream or piping', setupError);
                 reject(setupError); // Reject the promise on setup error
            }
        });
    },


    _addHeader(isTaxInvoice: boolean): void {
        this._doc!.fontSize(20).font('Helvetica-Bold').text(isTaxInvoice ? 'TAX INVOICE' : 'INVOICE', { align: 'center' });
        this._doc!.font('Helvetica'); // Revert to regular
        this._doc!.moveDown();
    },

    _addSellerInfo(seller: SellerProfile): void {
         const funcPrefix = `${this._logPrefix}:_addSellerInfo`;
         logger.debug(funcPrefix, 'Adding seller info');
         this._doc!.fontSize(12).text('From:', { underline: true });
         this._doc!.fontSize(10);
         this._doc!.text(seller.name || 'Seller Name Missing');
         this._doc!.text(seller.business_address || 'Seller Address Missing');
         this._doc!.text(`ABN/ACN: ${seller.ABN_or_ACN || 'Seller ABN/ACN Missing'}`);
         this._doc!.text(`Email: ${seller.contact_email || 'Seller Email Missing'}`);
         if (seller.phone) {
             this._doc!.text(`Phone: ${seller.phone}`);
         }
         this._doc!.moveDown();
    },

     _addCustomerInfo(customer: Omit<Customer, 'id'>): void {
         const funcPrefix = `${this._logPrefix}:_addCustomerInfo`;
         logger.debug(funcPrefix, 'Adding customer info');
         this._doc!.fontSize(12).text('To:', { underline: true });
         this._doc!.fontSize(10);
         if (customer.customer_type === 'business') {
             this._doc!.text(customer.business_name || 'Business Name Missing');
             if (customer.abn) {
                 this._doc!.text(`ABN: ${customer.abn}`);
             }
             const contactName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
             if (contactName) {
                 this._doc!.text(`Contact: ${contactName}`);
             }
         } else {
             const individualName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
             this._doc!.text(individualName || 'Customer Name Missing');
         }
         this._doc!.text(`Email: ${customer.email || 'N/A'}`);
         this._doc!.text(`Phone: ${customer.phone || 'N/A'}`);
         this._doc!.text(`Address: ${customer.address || 'N/A'}`);
         this._doc!.moveDown();
     },

     _addReceiptDetails(receiptId: string, dateIsoString: string): void {
        const funcPrefix = `${this._logPrefix}:_addReceiptDetails`;
        logger.debug(funcPrefix, `Adding receipt details ID: ${receiptId}, Date: ${dateIsoString}`);
        this._doc!.fontSize(10);
        this._doc!.text(`Invoice ID: ${receiptId}`);
        try {
            const dateObject = parseISO(dateIsoString);
            if (isNaN(dateObject.getTime())) {
                throw new Error('Invalid date object after parsing');
            }
            const formattedDate = format(dateObject, 'dd/MM/yyyy');
            this._doc!.text(`Date: ${formattedDate}`);
        } catch (e) {
            logger.warn(funcPrefix, `Could not parse or format date for PDF: ${dateIsoString}`, e);
            this._doc!.text(`Date: ${dateIsoString}`); // Fallback to ISO string
        }
        this._doc!.moveDown();
    },

    _drawTableHeader(includeGstColumn: boolean, y: number, startX: number, endX: number): void {
         const funcPrefix = `${this._logPrefix}:_drawTableHeader`;
         logger.debug(funcPrefix, `Drawing table header at Y=${y}`);
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

         const itemWidth = gstCol - itemCol - 10;
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
         const qtyWidth = priceCol - (includeGstColumn ? qtyCol : gstCol) - 10;
         const priceWidth = totalCol - priceCol - 10;
         const totalWidth = endX - totalCol;

         this._doc!.fontSize(10).font('Helvetica-Bold');
         this._doc!.text('Item', itemCol, y, { width: itemWidth, underline: true });
         if (includeGstColumn) this._doc!.text('GST?', gstCol, y, { width: gstWidth, underline: true, align: 'center' });
         this._doc!.text('Qty', includeGstColumn ? qtyCol : gstCol, y, { width: qtyWidth, underline: true, align: 'right' });
         this._doc!.text('Unit Price', priceCol, y, { width: priceWidth, underline: true, align: 'right' });
         this._doc!.text('Line Total', totalCol, y, { width: totalWidth, underline: true, align: 'right' });
         this._doc!.moveDown(0.5);
         this._doc!.font('Helvetica'); // Revert font
     },

     _addLineItemsTable(lineItems: LineItem[], includeGstColumn: boolean): void {
         const funcPrefix = `${this._logPrefix}:_addLineItemsTable`;
         logger.debug(funcPrefix, `Adding ${lineItems.length} line items to table.`);
         const tableTopInitial = this._doc!.y;
         const startX = 50;
         const endX = 550;
         const itemCol = startX;
         const gstCol = 250;
         const qtyCol = 320;
         const priceCol = 400;
         const totalCol = 480;

         const itemWidth = gstCol - itemCol - 10;
         const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
         const qtyWidth = priceCol - (includeGstColumn ? qtyCol : gstCol) - 10;
         const priceWidth = totalCol - priceCol - 10;
         const totalWidth = endX - totalCol;

         const tableBottomMargin = 70;
         const pageBottom = this._doc!.page.height - this._doc!.page.margins.bottom - tableBottomMargin;

         this._drawTableHeader(includeGstColumn, tableTopInitial, startX, endX);
         let currentY = this._doc!.y;

         lineItems.forEach((item, index) => {
             const itemHeightEstimate = 15; // Estimate row height
              // Check if adding this item would exceed the page boundary
             if (currentY + itemHeightEstimate > pageBottom) {
                 logger.debug(funcPrefix, `Adding new page before item ${index + 1} at Y=${currentY}. Page bottom limit: ${pageBottom}`);
                 this._doc!.addPage();
                 currentY = this._doc!.page.margins.top; // Reset Y to top margin
                 this._drawTableHeader(includeGstColumn, currentY, startX, endX);
                 currentY = this._doc!.y; // Get Y position after header
             }

             const unitPriceExGST = item.unit_price ?? 0;
             const lineTotalExGST = item.line_total ?? 0;

             // Use currentY for positioning each text element in the row
             this._doc!.text(item.product_name || 'N/A', itemCol, currentY, { width: itemWidth });
             if (includeGstColumn) this._doc!.text(item.GST_applicable ? 'Yes' : 'No', gstCol, currentY, { width: gstWidth, align: 'center' });
             this._doc!.text(item.quantity?.toString() ?? '0', includeGstColumn ? qtyCol : gstCol, currentY, { width: qtyWidth, align: 'right' });
             this._doc!.text(`$${unitPriceExGST.toFixed(2)}`, priceCol, currentY, { width: priceWidth, align: 'right' });
             this._doc!.text(`$${lineTotalExGST.toFixed(2)}`, totalCol, currentY, { width: totalWidth, align: 'right' });

             // After writing the row, explicitly move to the next line position
             // We use moveDown(1) which is roughly font size + leading
             this._doc!.moveDown(0.75); // Add fixed space after each row
             currentY = this._doc!.y; // Update currentY for the next iteration's check
         });

         this._doc!.y = currentY; // Ensure doc.y is at the end of the items
         this._doc!.moveDown(0.5); // Add a bit more space before the separator line

         // Draw a line before totals
         logger.debug(funcPrefix, `Drawing separator line before totals at Y=${this._doc!.y}`);
         this._doc!.moveTo(startX, this._doc!.y).lineTo(endX, this._doc!.y).strokeColor('#cccccc').stroke();
         this._doc!.moveDown(0.5);
     },

     _addTotals(subtotal: number, gstAmount: number, total: number): void {
         const funcPrefix = `${this._logPrefix}:_addTotals`;
         logger.debug(funcPrefix, `Adding totals: Sub=${subtotal}, GST=${gstAmount}, Total=${total}`);
         const totalsX = 400;
         const labelX = 50;
         const endX = 550;
         let totalsY = this._doc!.y; // Start position for totals

         const pageBottom = this._doc!.page.height - this._doc!.page.margins.bottom - 20;
         const totalsHeightEstimate = 60; // Estimate height needed for totals

         // Check if totals fit on the current page
         if (totalsY + totalsHeightEstimate > pageBottom) {
             logger.debug(funcPrefix, `Adding new page before totals section at Y=${totalsY}. Page bottom limit: ${pageBottom}`);
             this._doc!.addPage();
             totalsY = this._doc!.page.margins.top; // Reset Y position for the new page
             this._doc!.y = totalsY; // Set doc's current Y
         }

         // Use consistent font and size for labels and amounts initially
         this._doc!.fontSize(10).font('Helvetica');

         // Subtotal
         this._doc!.text(`Subtotal (ex GST):`, labelX, totalsY, { continued: false, align: 'left' }); // Use continued: false to place individually
         this._doc!.text(`$${subtotal.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: endX - totalsX });
         totalsY = this._doc!.y + 2; // Add small gap after line

         // GST Amount
         this._doc!.text(`GST Amount:`, labelX, totalsY, { continued: false, align: 'left' });
         this._doc!.text(`$${gstAmount.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: endX - totalsX });
         totalsY = this._doc!.y + 2; // Add small gap after line

         // Draw separator line
         const lineY = totalsY + 5;
         logger.debug(funcPrefix, `Drawing separator line for totals at Y=${lineY}`);
         this._doc!.moveTo(totalsX - 50, lineY).lineTo(endX, lineY).strokeColor('#aaaaaa').stroke();
         totalsY = lineY + 5; // Move current position below the line
         this._doc!.y = totalsY;

         // Total - Make it bold and slightly larger
         this._doc!.font('Helvetica-Bold').fontSize(12);
         this._doc!.text(`Total (inc GST):`, labelX, totalsY, { continued: false, align: 'left'});
         this._doc!.text(`$${total.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: endX - totalsX });
         totalsY = this._doc!.y; // Update Y after text

         // Revert font settings
         this._doc!.font('Helvetica').fontSize(10);
         this._doc!.y = totalsY; // Ensure doc.y is at the end of the totals block
         this._doc!.moveDown();
     },

    async _finalize(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_finalize`;
        return new Promise((resolve, reject) => {
            if (!this._doc) {
                 logger.error(funcPrefix, "Finalize called without an initialized document.");
                 return reject(new Error("Document not initialized."));
            }
            if (!this._stream) {
                 logger.error(funcPrefix, "Finalize called without an initialized stream.");
                 return reject(new Error("Stream not initialized."));
            }

            // Ensure stream finish/error listeners resolve/reject this promise
             const streamFinishPromise = new Promise<void>((res, rej) => {
                 this._stream!.once('finish', res);
                 this._stream!.once('error', rej);
                 this._doc!.once('error', rej); // Also listen for doc errors during finalization
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
                     logger.error(funcPrefix, 'Stream or document error during finalize', err);
                      this._success = false;
                     reject(err);
                 });
        });
    },


    async cleanupFailedPdf(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:cleanupFailedPdf`;
        logger.warn(funcPrefix, `Attempting cleanup for: ${this._filePath}`);
        try {
            // Close stream if it exists and is still open/writable
            if (this._stream && !this._stream.closed && this._stream.writable) {
                logger.debug(funcPrefix, 'Closing potentially open write stream...');
                await new Promise<void>((resolve) => {
                     this._stream!.once('close', () => {
                         logger.debug(funcPrefix, 'Stream closed event received during cleanup.');
                         resolve();
                     });
                     this._stream!.once('error', (err) => {
                         logger.error(funcPrefix, 'Error closing stream during cleanup', err);
                         resolve(); // Resolve anyway to continue cleanup
                     });
                     this._stream!.end(() => {
                         logger.debug(funcPrefix, 'stream.end callback executed during cleanup.');
                     }); // End the stream gracefully
                 });
                 logger.debug(funcPrefix, 'Finished waiting for stream close/error.');
            } else {
                logger.debug(funcPrefix, 'No active/writable stream to close or already closed.');
            }

            // Try to delete the potentially corrupted/incomplete file
             logger.debug(funcPrefix, `Checking existence of potentially incomplete PDF: ${this._filePath}`);
             try {
                 accessSync(this._filePath); // Use sync for simplicity in cleanup
                 logger.warn(funcPrefix, `Attempting to delete incomplete/corrupted PDF: ${this._filePath}`);
                 unlinkSync(this._filePath); // Use sync
                 logger.info(funcPrefix, `Deleted incomplete/corrupted PDF: ${this._filePath}`);
             } catch (accessOrUnlinkError: any) {
                 if (accessOrUnlinkError.code === 'ENOENT') {
                     logger.info(funcPrefix, `Incomplete PDF ${this._filePath} did not exist, no need to delete.`);
                 } else {
                     logger.error(funcPrefix, 'Error accessing or deleting potentially corrupted PDF during cleanup', accessOrUnlinkError);
                 }
             }
        } catch (cleanupError) {
            logger.error(funcPrefix, 'Error during PDF cleanup process itself', cleanupError);
        } finally {
            // Nullify references
            this._doc = null;
            this._stream = null;
            this._filePath = '';
            this._logPrefix = '';
        }
    },


    async generate(receipt: Receipt, operationId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
        try {
            this._initialize(receipt.receipt_id, operationId); // Can throw if PDFDocument fails
        } catch(initError: any) {
             logger.error(this._logPrefix, 'ERROR during PDF initialization', initError);
             // No cleanup needed yet as stream/file haven't been created
             return { success: false, message: initError.message || "PDF initialization failed." };
        }

        try {
            await this._setupStream();

            // --- Add Content ---
            logger.debug(this._logPrefix, 'Adding content to PDF...');
            this._addHeader(receipt.is_tax_invoice);
            this._addSellerInfo(receipt.seller_profile_snapshot);
            this._addCustomerInfo(receipt.customer_snapshot);
            this._addReceiptDetails(receipt.receipt_id, receipt.date_of_purchase);
            this._addLineItemsTable(receipt.line_items, receipt.GST_amount > 0);
            this._addTotals(receipt.subtotal_excl_GST, receipt.GST_amount, receipt.total_inc_GST);

            // --- Finalize Document ---
            await this._finalize();

            logger.info(this._logPrefix, `PDF generation process completed. Success flag: ${this._success}`);
            if (!this._success) {
                throw new Error("Stream finished or errored, but success flag was not set correctly.");
            }
            logger.info(this._logPrefix, 'PDF generation successful.');
            const finalFilePath = this._filePath; // Store before potential cleanup resets it
             // Reset internal state for potential reuse (though typically one instance per generation)
             this._doc = null;
             this._stream = null;
             this._filePath = '';
             this._logPrefix = '';
            return { success: true, filePath: finalFilePath };

        } catch (error: any) {
            logger.error(this._logPrefix, 'ERROR during PDF generation orchestration', error);
            await this.cleanupFailedPdf(); // Ensure cleanup happens

            // Format error message
            let message = `Failed to generate PDF: ${error.message || 'Unknown error'}`;
            if (error instanceof TypeError && (error.message.includes('is not a constructor') || error.message.includes('is not a function'))) {
                 message = `Failed to generate PDF: PDF library issue. (${error.message})`; // Simplified message
                 logger.error(this._logPrefix, 'PDFKit library instantiation or usage failed. Check imports, dependencies, and usage patterns.');
            } else if (error.message.includes('ENOENT') && error.message.includes('.afm')) {
                 message = `Failed to generate PDF: Font file error. Ensure fonts are correctly installed/accessible. (${error.message})`;
                 logger.error(this._logPrefix, 'PDFKit font file error. Missing or inaccessible font file.', error);
            }

             return { success: false, message };
        }
    }
};


// --- Core Invoice Creation Logic ---

interface CreateReceiptInput {
  customer_id: string;
  date_of_purchase: string; // Expecting 'yyyy-MM-dd' string from the form
  line_items: Array<{ product_id: string; quantity: number }>;
  include_gst: boolean; // Explicit flag from UI
  force_tax_invoice?: boolean; // Optional flag if user requests tax invoice explicitly
}

export async function createReceipt(
    input: CreateReceiptInput
): Promise<{ success: boolean; message?: string; receipt?: Receipt; pdfPath?: string }> {
    const operationId = uuidv4().substring(0, 8); // Short ID for logging this specific operation
    const funcPrefix = `${LOG_PREFIX}:createReceipt:${operationId}`;
    logger.info(funcPrefix, `Starting receipt creation for customer ${input.customer_id}`, input);

    // 0. Ensure directories exist (critical before any file ops)
    try {
        await ensureDirectoriesExist();
    } catch (dirError: any) {
        logger.error(funcPrefix, 'Directory creation/verification failed', dirError);
        return { success: false, message: `Failed to prepare storage: ${dirError.message}` };
    }

    // 1. Validation
    logger.debug(funcPrefix, 'Validating input...');
    if (!input.customer_id || !input.line_items || input.line_items.length === 0) {
        logger.error(funcPrefix, 'Validation failed: Missing customer or line items.');
        return { success: false, message: 'Customer and at least one line item are required.' };
    }
    if (input.line_items.some(item => !item.product_id || item.quantity == null || item.quantity <= 0)) {
       logger.error(funcPrefix, 'Validation failed: Invalid line item data.', input.line_items);
       return { success: false, message: 'Each line item must have a valid product ID and a quantity greater than 0.' };
    }
    logger.debug(funcPrefix, 'Input validation passed.');

    try {
        // 2. Fetch Required Data
        logger.info(funcPrefix, 'Fetching customer, products, and seller profile...');
        const [customerResult, sellerProfileResult, productsResult] = await Promise.allSettled([
            getCustomerById(input.customer_id),
            getSellerProfile(),
            Promise.allSettled(input.line_items.map(item => getProductById(item.product_id)))
        ]);

        // Check Seller Profile
        if (sellerProfileResult.status === 'rejected') {
            logger.error(funcPrefix, 'Failed to fetch seller profile', sellerProfileResult.reason);
            return { success: false, message: `Failed to load seller profile: ${sellerProfileResult.reason?.message || 'Unknown error'}` };
        }
        const sellerProfile = sellerProfileResult.value;
         if (!sellerProfile?.name || !sellerProfile?.ABN_or_ACN || !sellerProfile?.business_address) {
             logger.error(funcPrefix, 'Seller profile is incomplete', sellerProfile);
             return { success: false, message: 'Seller profile is incomplete. Please configure it in Settings.' };
         }

        // Check Customer
         if (customerResult.status === 'rejected') {
             logger.error(funcPrefix, `Failed to fetch customer ${input.customer_id}`, customerResult.reason);
             return { success: false, message: `Failed to load customer: ${customerResult.reason?.message || 'Unknown error'}` };
         }
         const customer = customerResult.value;
        if (!customer) {
            logger.error(funcPrefix, `Customer not found: ${input.customer_id}`);
            return { success: false, message: `Customer with ID ${input.customer_id} not found.` };
        }

        // Process Products Results
        if (productsResult.status === 'rejected') {
             logger.error(funcPrefix, 'Unexpected error fetching products array', productsResult.reason);
             return { success: false, message: `Error processing product list: ${productsResult.reason?.message || 'Unknown error'}` };
        }

        const fetchedProductsResults = productsResult.value;
        const missingProductIds: string[] = [];
        const validProductsMap = new Map<string, Product>();

        fetchedProductsResults.forEach((result, index) => {
            const productId = input.line_items[index].product_id;
            if (result.status === 'fulfilled' && result.value) {
                validProductsMap.set(productId, result.value);
            } else {
                missingProductIds.push(productId);
                logger.error(funcPrefix, `Product fetch failed or product not found: ${productId}`, result.status === 'rejected' ? result.reason : 'Not found');
            }
        });

        if (missingProductIds.length > 0) {
            logger.error(funcPrefix, `Failed to fetch products: ${missingProductIds.join(', ')}`);
            return { success: false, message: `Product(s) not found or failed to load: ${missingProductIds.join(', ')}.` };
        }
        logger.info(funcPrefix, 'Fetched all required data successfully.');


        // 3. Perform Calculations
        logger.debug(funcPrefix, 'Calculating totals...');
        const calculationResult = calculateInvoiceTotals(input.line_items, validProductsMap, input.include_gst, funcPrefix);
        logger.debug(funcPrefix, 'Calculations complete', calculationResult);

        // 4. Determine Invoice Type (Tax Invoice / Invoice)
        logger.debug(funcPrefix, 'Determining invoice type...');
        const totalAmount = calculationResult.total_inc_GST;
        // GST is included if the flag is set AND there was actually GST applied (GST amount > 0)
        const gstWasApplied = input.include_gst && calculationResult.total_gst_amount > 0;
        // Force flag overrides the amount check, but still requires GST to be included conceptually
        const isTaxInvoiceRequired = (gstWasApplied && totalAmount >= 82.50) || (!!input.force_tax_invoice && input.include_gst);
        logger.debug(funcPrefix, `Is Tax Invoice: ${isTaxInvoiceRequired} (Total: ${totalAmount}, IncludeGST: ${input.include_gst}, GstApplied: ${gstWasApplied}, Force: ${!!input.force_tax_invoice})`);


        // 5. Prepare Snapshots and Create Receipt Object
        logger.debug(funcPrefix, 'Creating receipt object with snapshots...');
        const customerSnapshot = createCustomerSnapshot(customer);
        const sellerProfileSnapshot = createSellerSnapshot(sellerProfile);
        let purchaseDate: Date;
        try {
            // Assume input.date_of_purchase is 'yyyy-MM-dd' and treat it as UTC start of day
            purchaseDate = parseISO(`${input.date_of_purchase}T00:00:00.000Z`);
             if (isNaN(purchaseDate.getTime())) {
                 throw new Error('Invalid date format parsed');
             }
         } catch (dateError) {
             logger.error(funcPrefix, `Invalid date format provided: ${input.date_of_purchase}`, dateError);
             return { success: false, message: `Invalid date of purchase format: ${input.date_of_purchase}. Expected YYYY-MM-DD.` };
         }


        const newReceipt: Receipt = {
            receipt_id: uuidv4(),
            customer_id: input.customer_id,
            date_of_purchase: purchaseDate.toISOString(), // Store as ISO string
            line_items: calculationResult.calculatedLineItems,
            subtotal_excl_GST: calculationResult.subtotal_excl_GST,
            GST_amount: calculationResult.total_gst_amount,
            total_inc_GST: calculationResult.total_inc_GST,
            is_tax_invoice: isTaxInvoiceRequired,
            seller_profile_snapshot: sellerProfileSnapshot,
            customer_snapshot: customerSnapshot,
        };
        logger.info(funcPrefix, `Receipt object created with ID: ${newReceipt.receipt_id}`);

        // 6. Generate PDF using the dedicated service
        logger.info(funcPrefix, `Generating PDF for receipt ID: ${newReceipt.receipt_id}`);
        const pdfGenerationResult = await PdfGenerator.generate(newReceipt, operationId);

        if (!pdfGenerationResult.success || !pdfGenerationResult.filePath) {
             logger.error(funcPrefix, `PDF generation failed for ${newReceipt.receipt_id}: ${pdfGenerationResult.message}`);
             // Cleanup is handled within PdfGenerator.generate on failure
             return { success: false, message: pdfGenerationResult.message || "Failed to generate PDF." };
        }
        logger.info(funcPrefix, `PDF generated successfully at: ${pdfGenerationResult.filePath}`);


        // 7. Save Receipt Data (only after successful PDF generation)
        logger.info(funcPrefix, 'Saving receipt data...');
        const allReceipts = await readReceipts();
        allReceipts.unshift(newReceipt); // Add to the beginning (most recent first)
        await writeReceipts(allReceipts);
        logger.info(funcPrefix, 'Receipt data saved successfully.');

        return { success: true, receipt: newReceipt, pdfPath: pdfGenerationResult.filePath };

    } catch (error: any) {
        logger.error(funcPrefix, `Unhandled error during receipt creation for customer ${input.customer_id}`, error);
         // Check if the error is the specific font loading error
         if (error.message && error.message.includes('ENOENT') && error.message.includes('.afm')) {
             logger.error(funcPrefix, 'Font loading error detected during receipt creation.', error);
             return { success: false, message: `Failed to generate PDF due to a font issue. Ensure fonts are accessible. Error: ${error.message}` };
         }
         return { success: false, message: `An unexpected error occurred during invoice creation: ${error.message || 'Unknown error. Check server logs.'}` };
    }
}

// --- Calculation Logic (Extracted) ---

function calculateInvoiceTotals(
    inputItems: Array<{ product_id: string; quantity: number }>,
    productsMap: Map<string, Product>,
    includeGstGlobally: boolean,
    parentLogPrefix: string = LOG_PREFIX // Optional parent prefix for context
): {
    calculatedLineItems: LineItem[];
    subtotal_excl_GST: number;
    total_gst_amount: number;
    total_inc_GST: number;
} {
    const funcPrefix = `${parentLogPrefix}:calculateTotals`;
    let subtotal_excl_GST = 0;
    let total_gst_amount = 0;
    const calculatedLineItems: LineItem[] = [];

    inputItems.forEach((item) => {
        const product = productsMap.get(item.product_id);
        if (!product) {
            logger.error(funcPrefix, `Calculation Error: Product missing ${item.product_id}. This should not happen if pre-fetch validation passed.`);
            // Skip this item or throw error depending on strictness needed
            return;
        }

        const lineTotalExclGST = product.unit_price * item.quantity;
        subtotal_excl_GST += lineTotalExclGST;

        let lineGstAmount = 0;
        if (includeGstGlobally && product.GST_applicable) {
             lineGstAmount = lineTotalExclGST * 0.1;
             total_gst_amount += lineGstAmount;
             logger.debug(funcPrefix, `Applied GST ${lineGstAmount.toFixed(2)} to product ${product.name} (ID: ${product.id})`);
        } else {
             logger.debug(funcPrefix, `Skipped GST for product ${product.name} (ID: ${product.id}). Global: ${includeGstGlobally}, Applicable: ${product.GST_applicable}`);
        }

        calculatedLineItems.push({
            product_id: product.id,
            quantity: item.quantity,
            unit_price: product.unit_price,
            line_total: parseFloat(lineTotalExclGST.toFixed(2)),
            product_name: product.name,
            GST_applicable: product.GST_applicable,
        });
    });

    if (!includeGstGlobally) {
        // If GST wasn't included globally, ensure the total GST is zero,
        // even if individual items might have been applicable.
        if (total_gst_amount > 0) {
            logger.warn(funcPrefix, `Resetting total_gst_amount to 0 because includeGstGlobally is false, although individual items summed to ${total_gst_amount.toFixed(2)}.`);
        }
        total_gst_amount = 0;
    }

    const total_inc_GST = subtotal_excl_GST + total_gst_amount;

    logger.debug(funcPrefix, `Totals calculated: Subtotal=${subtotal_excl_GST.toFixed(2)}, GST=${total_gst_amount.toFixed(2)}, Total=${total_inc_GST.toFixed(2)}`);

    return {
        calculatedLineItems,
        subtotal_excl_GST: parseFloat(subtotal_excl_GST.toFixed(2)),
        total_gst_amount: parseFloat(total_gst_amount.toFixed(2)),
        total_inc_GST: parseFloat(total_inc_GST.toFixed(2)),
    };
}

// --- Snapshot Creation (Extracted) ---

function createCustomerSnapshot(customer: Customer): Omit<Customer, 'id'> {
     logger.debug(LOG_PREFIX, `Creating customer snapshot for ID ${customer.id}`);
     return {
        customer_type: customer.customer_type,
        first_name: customer.first_name || undefined,
        last_name: customer.last_name || undefined,
        business_name: customer.business_name || undefined,
        abn: customer.abn || undefined,
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        address: customer.address || undefined,
    };
}

function createSellerSnapshot(sellerProfile: SellerProfile): SellerProfile {
     logger.debug(LOG_PREFIX, `Creating seller snapshot for ${sellerProfile.name}`);
    return {
        name: sellerProfile.name || 'N/A',
        business_address: sellerProfile.business_address || 'N/A',
        ABN_or_ACN: sellerProfile.ABN_or_ACN || 'N/A',
        contact_email: sellerProfile.contact_email || 'N/A',
        phone: sellerProfile.phone || '',
        logo_url: sellerProfile.logo_url || '',
    };
}


// --- PDF Retrieval Actions ---
export async function getReceiptPdfPath(receiptId: string): Promise<string | null> {
    const funcPrefix = `${LOG_PREFIX}:getReceiptPdfPath:${receiptId}`;
    if (!receiptId) {
        logger.warn(funcPrefix, 'Called with empty receiptId.');
        return null;
    }
    const pdfPath = path.join(PDF_DIR, `${receiptId}.pdf`);
    logger.debug(funcPrefix, `Checking for PDF at path: ${pdfPath}`);
    try {
        await ensureDirectoriesExist();
        await fsPromises.access(pdfPath);
        logger.info(funcPrefix, 'PDF path found.');
        return pdfPath;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            logger.warn(funcPrefix, 'PDF file not found.');
        } else {
            logger.error(funcPrefix, 'Error accessing PDF file', error);
        }
        return null;
    }
}

// Helper function to get receipt by ID
async function getReceiptById(id: string): Promise<Receipt | null> {
    const funcPrefix = `${LOG_PREFIX}:getReceiptById:${id}`;
    if (!id) return null;
    logger.debug(funcPrefix, `Attempting to find receipt by ID.`);
    const receipts = await readReceipts(); // Uses its own logging
    const receipt = receipts.find(r => r.receipt_id === id);
     if (receipt) {
         logger.debug(funcPrefix, `Receipt found.`);
     } else {
         logger.warn(funcPrefix, `Receipt not found.`);
     }
    return receipt || null;
}


export async function getReceiptPdfContent(receiptId: string): Promise<Buffer | null> {
     const funcPrefix = `${LOG_PREFIX}:getReceiptPdfContent:${receiptId}`;
     if (!receiptId) {
         logger.warn(funcPrefix, 'Called with empty receiptId.');
         return null;
     }
     const pdfPath = await getReceiptPdfPath(receiptId); // Uses its own logging
     if (!pdfPath) {
         logger.warn(funcPrefix, 'PDF path not found, cannot get content.');
         return null;
     }

     try {
         logger.debug(funcPrefix, `Reading PDF content from path: ${pdfPath}`);
         const pdfContent = await fsPromises.readFile(pdfPath);
         logger.info(funcPrefix, `Successfully read PDF content (${pdfContent.length} bytes).`);
         return pdfContent;
     } catch (error: any) {
         logger.error(funcPrefix, `Error reading PDF content from path ${pdfPath}`, error);
         if (error.code === 'ENOENT') {
             logger.error(funcPrefix, 'PDF file disappeared between check and read.');
         }
         return null;
     }
}

// Run initial directory check on module load
ensureDirectoriesExist().catch(err => {
    logger.error(LOG_PREFIX, "Initial directory check failed on module load", err);
    // Depending on severity, you might want to prevent the app from starting fully
});
