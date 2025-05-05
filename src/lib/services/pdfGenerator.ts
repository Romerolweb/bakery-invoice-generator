// src/lib/services/pdfGenerator.ts
// REMOVED 'use server'; directive as this file exports a class, not Server Action functions.

import type { Receipt, LineItem, Customer, SellerProfile } from '@/lib/types';
import { promises as fsPromises, createWriteStream, accessSync, unlinkSync, WriteStream } from 'fs';
import type {  PathLike } from 'fs';
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

class PdfGenerationProcess {
    private _doc?: typeof PDFDocument;
    private _stream!: WriteStream;
    private _filePath?: PathLike;
    private _logPrefix?: string;
    private _operationId?: string;
    private _success: boolean = false;
    static isGenerating: boolean = false; // Simple lock to avoid concurrent requests

    constructor() {
        // This is where you might have a fonts config file, or similar. For now, just setting these:
        // this._helveticaPath = path.join(FONTS_DIR, 'Helvetica.afm');
    }

    // Ensures the PDF output directory exists
    private async _ensurePdfDirectoryExists(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_ensurePdfDirectoryExists`;
 logger.debug(funcPrefix, `Checking if PDF output directory exists: ${String(PDF_DIR)}`);
        try {
            await fsPromises.access(PDF_DIR);
            logger.debug(funcPrefix, `PDF directory exists: ${PDF_DIR}`);
        } catch (error) {
            if ((error as any).code === 'ENOENT') { // Check if the error is because the directory does not exist
                logger.warn(funcPrefix, `PDF directory does not exist, creating: ${PDF_DIR}`);
                await fsPromises.mkdir(PDF_DIR, { recursive: true });
                logger.debug(funcPrefix, `PDF directory created: ${PDF_DIR}`);
            } else {
                logger.error(funcPrefix, `Error accessing PDF directory: ${PDF_DIR}`, String(error));
                throw error;
            }
        }
    }

    private async _setupStream(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_setupStream`;
        logger.debug(funcPrefix, "Starting stream setup"); // Add this
        
        if(!this._filePath){
            throw new Error("File Path not set.");
        }
        await this._ensurePdfDirectoryExists();
        
        logger.debug(funcPrefix, `Creating write stream for ${String(this._filePath)}`); // Check this path
        this._stream = createWriteStream(this._filePath);
 logger.debug(funcPrefix, `Stream created`); // Check if stream exists
        
        this._stream.on('finish', () => {
            logger.info(funcPrefix, 'PDF stream finished.');
        });

        this._stream.on('error', (err) => {
            logger.error(funcPrefix, 'PDF stream error:', err); // Log the whole object
            logger.error(funcPrefix, 'PDF stream error:', JSON.stringify(err)); // This should log every detail
            this._success = false;
        });

        if (!this._doc) {
            throw new Error("PDF Document not initialized before setting up stream.");
        }

        this._doc.on('error', (err) => {
            logger.error(funcPrefix, 'PDF document error during piping', err);
            this._success = false;
        });
        logger.debug(funcPrefix, 'Piping PDF document to stream...');
        this._doc.pipe(this._stream);
        logger.debug(funcPrefix, 'Stream setup completed');
    }

    // Creates a new PDF document and configures it.
    private async _initPdfDoc(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_initPdfDoc`;
        try {
            // Initialize the PDF document
            logger.debug(funcPrefix, `Initializing PDF document...`);
            this._doc = new PDFDocument({
                margin: 50, // Can be moved to a config or input
                bufferPages: true,
                // font: this._helveticaPath, // Set default font path - might not always work as expected, explicit calls are safer
            });
            logger.debug(funcPrefix, `PDFDocument instantiated successfully.`);
        } catch (initError) {
            logger.error(funcPrefix, `FATAL: Error initializing PDF Generator:`, String(initError));
            // Rethrow or handle specific errors (like font missing error)
            throw new Error(`PDF library initialization error: ${initError instanceof Error ? initError.message : String(initError)}`);
        }
    }

    private _addDocumentHeader(): void {
        const funcPrefix = `${this._logPrefix}:_addDocumentHeader`;
        if (!this._doc) {
            logger.error(funcPrefix, "FATAL: _addDocumentHeader called without document initialized.");
            throw new Error('_addDocumentHeader called without document initialized.');
        }

        logger.debug(funcPrefix, `Adding document header...`);
        this._doc
            .font('Helvetica-Bold') // Use bundled font directly
            .fontSize(24)
            .text('Receipt', { align: 'center' })
            .moveDown();
    }

    private _addReceiptDetails(receipt: Receipt, customer: Customer, seller: SellerProfile): void {
        const funcPrefix = `${this._logPrefix}:_addReceiptDetails`;
        if (!this._doc) {
            logger.error(funcPrefix, "FATAL: _addReceiptDetails called without document initialized.");
            throw new Error('_addReceiptDetails called without document initialized.');
        }

        // Use date-fns to format the date
        const formattedDate = format(parseISO(receipt.date_of_purchase), 'dd/MM/yyyy');

        this._doc
            .font('Helvetica')
            .fontSize(12)
            .text(`Receipt ID: ${receipt.receipt_id}`, { align: 'left' })
            .text(`Date: ${formattedDate}`, { align: 'left' })
            .moveDown();

        this._doc.text('Customer Details', { align: 'left' }).moveDown();
        this._doc.text(`Name: ${customer.customer_type === 'business' ? customer.business_name : `${customer.first_name} ${customer.last_name}`}`, { align: 'left' });
        this._doc.text(`Email: ${customer.email}`, { align: 'left' });
        this._doc.text(`Phone: ${customer.phone}`, { align: 'left' });
        this._doc.text(`Address: ${customer.address}`, { align: 'left' }).moveDown();

        this._doc.text('Seller Details', { align: 'left' }).moveDown();
        this._doc.text(`Business Name: ${seller.name}`, { align: 'left' });
        this._doc.text(`ABN: ${seller.ABN_or_ACN}`, { align: 'left' });
        this._doc.text(`Address: ${seller.business_address}`, { align: 'left' }).moveDown();
    }

    private _addLineItems(lineItems: LineItem[]): void {
        const funcPrefix = `${this._logPrefix}:_addLineItems`;
        if (!this._doc) {
            logger.error(funcPrefix, "FATAL: _addLineItems called without document initialized.");
            throw new Error('_addLineItems called without document initialized.');
        }

        this._doc.font('Helvetica-Bold').text('Line Items', { align: 'left' }).moveDown();

        lineItems.forEach(item => {
            if (this._doc) { // Check if _doc is initialized before use
                const itemText = `${item.quantity} x ${item.description} @ $${item.unit_price.toFixed(2)} = $${item.line_total.toFixed(2)}`;
                this._doc.font('Helvetica').text(itemText, { align: 'left' });
        } else {
        logger.error(funcPrefix, "FATAL: _doc is undefined in line item loop.");
        }
        });
        this._doc.moveDown();
    }

    private _addTotal(total: number): void {
        const funcPrefix = `${this._logPrefix}:_addTotal`;
        if (!this._doc) {
            logger.error(funcPrefix, "FATAL: _addTotal called without document initialized.");
            throw new Error('_addTotal called without document initialized.');
        }

        this._doc
            .font('Helvetica-Bold')
            .fontSize(14)
            .text(`Total: $${total.toFixed(2)}`, { align: 'right' });

        this._doc.end();
    }

    private async _cleanupFailedPdf(): Promise<void> {
        const funcPrefix = `${this._logPrefix || `[${this._operationId} PDF ${path.basename(String(this._filePath)!, '.pdf') || 'unknown'}]`}:_cleanupFailedPdf`;
        if (!this._filePath) {
            logger.debug(funcPrefix, "Cleanup called without a file path, likely initialization failed early.");
            return;
 }
 logger.debug(funcPrefix, `Attempting cleanup for: ${String(this._filePath)}`);
        try {
            // Attempt to delete the file
 logger.debug(funcPrefix, `Checking existence of potentially incomplete PDF: ${String(this._filePath)}`);
            try {
                await fsPromises.access(this._filePath); // Use async access check
 logger.warn(funcPrefix, `Attempting to delete incomplete/corrupted PDF: ${String(this._filePath)}`);
                await fsPromises.unlink(this._filePath); // Use async unlink
            } catch (innerError) {
                // If we can't check, or delete, log it but continue anyway
                logger.error(funcPrefix, `Error during cleanup operation for ${this._filePath}: ${String(innerError)}`);
            }
        } catch (error) {
            logger.error(funcPrefix, `Unhandled error during PDF cleanup for ${this._filePath}: ${String(error)}`);
 }
    }

    public async generate(receipt: Receipt, operationId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
        const funcPrefix = `[${operationId} PDF ${receipt?.receipt_id || 'unknown'}]`;
        this._logPrefix = funcPrefix;
        this._operationId = operationId;
        this._success = false; // Start in failure state
        try {
            // Verify and extract required data from receipt
            if (!receipt || !receipt.customer_snapshot || !receipt.seller_profile_snapshot || !receipt.line_items || typeof receipt.total_inc_GST !== 'number') {
                const message = 'Invalid or incomplete receipt data provided.';
                logger.error(funcPrefix, message, receipt);
                return { success: false, message: message }; // Explicitly return the message
            }
            
            const { customer_snapshot, seller_profile_snapshot: seller, line_items, total_inc_GST } = receipt;
            
            logger.info(funcPrefix, `Starting PDF generation...`);
            
            // Set the output file path (unique to the receipt)
            this._filePath = path.join(PDF_DIR, `${receipt.receipt_id}.pdf`);
            
            // Initialize the PDF document
            await this._initPdfDoc();
            // Setup the stream before piping the PDF. 
            await this._setupStream();
            
            // Add the document header
            this._addDocumentHeader();
            this._addReceiptDetails(receipt, customer_snapshot, seller);
            this._addLineItems(receipt.line_items); // Use line_items from receipt
            this._addTotal(total_inc_GST);
            
            await new Promise<void>((resolve, reject) => {
                this._stream.on('finish', resolve);
                this._stream.on('error', reject);
            });
           
            // This success flag is set by the stream 'finish' event, but ensure it's true before returning
            if (this._success) {
                logger.info(funcPrefix, 'PDF generation completed successfully.');
                return { success: true, filePath: this._filePath?.toString() };
            } else {
                 // If stream errored but no catch happened
                logger.error(funcPrefix, 'PDF generation failed after stream setup.');
                await this._cleanupFailedPdf();
                return { success: false, message: 'PDF stream encountered an error.' };
            }
            
        } catch (error) {
            logger.error(funcPrefix, `Error caught during PDF generation: ${String(error)}`, Error);
            await this._cleanupFailedPdf(); // Attempt cleanup if we fail.
            let message = `Failed to generate PDF: ${String(Error.toString) || 'Unknown error'}`;
            // Check specifically for font errors originating from the library or our checks
            if (String(Error.toString)?.includes('font') && String(Error.toString)?.includes('missing')) {
                message = String(Error.toString); // Use the specific font error message
            } else if (String(Error.toString)?.includes('ENOENT') && String(Error.toString)?.includes('.afm')) {
                // Catch potential lingering default font path errors (should be less likely now)
                message = `Failed to generate PDF: Could not find required font metric file (.afm). Ensure fonts are in src/lib/fonts/. Details: ${Error.toString}`;
            }

            return { success: false, message };
        }
    }
}

export class PdfGenerator {
    static isGenerating: boolean = false; // Simple lock to avoid concurrent requests

    public async generatePdf(receipt: Receipt, operationId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
        if (PdfGenerator.isGenerating) {
             logger.warn(`[${operationId} PDF ${receipt?.receipt_id || 'unknown'}]`, 'PDF generation is already in progress. Rejecting concurrent request.');
             return { success: false, message: 'A PDF generation is currently in progress.' };
        }
        PdfGenerator.isGenerating = true; // Acquire lock
        const process = new PdfGenerationProcess();
        const result = await process.generate(receipt, operationId);
        PdfGenerator.isGenerating = false; // Release lock
        return result;
    }
}
