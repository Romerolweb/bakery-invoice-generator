// src/lib/actions/receipts.ts
'use server';

import type { Receipt, LineItem, Customer, Product, SellerProfile } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { getCustomerById } from './customers';
import { getProductById } from './products';
import { getSellerProfile } from './seller';
import { format, parseISO } from 'date-fns';

const DATA_DIR = path.join(process.cwd(), 'src/lib/data');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs

// --- Helper Functions ---

// Ensure necessary directories exist
async function ensureDirectoriesExist() {
    try {
        console.log('Ensuring data directories exist...');
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(PDF_DIR, { recursive: true });
        console.log('Data directories ensured.');
    } catch (error) {
        console.error('Error creating data/PDF directories:', error);
        // Allow the app to continue, but log the error
    }
}

// Helper function to read receipts data
export async function readReceipts(): Promise<Receipt[]> { // Exported for potential use/testing
  try {
    const fileContent = await fs.readFile(RECEIPTS_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log("Receipts file not found, returning empty array.");
      return [];
    }
    console.error('Error reading receipts:', error);
    throw new Error('Could not load receipts.');
  }
}

// Helper function to write receipts data
export async function writeReceipts(receipts: Receipt[]): Promise<void> { // Exported for potential use/testing
  try {
    await fs.writeFile(RECEIPTS_FILE, JSON.stringify(receipts, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing receipts:', error);
    throw new Error('Failed to save receipts.');
  }
}

// Initialize directories on server start/load
ensureDirectoriesExist();


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
    console.log(`Starting receipt creation for customer ${input.customer_id}`);

    // 1. Validation
    console.log('Validating input...');
    if (!input.customer_id || !input.line_items || input.line_items.length === 0) {
        console.error('Validation failed: Missing customer or line items.');
        return { success: false, message: 'Customer and at least one line item are required.' };
    }
    if (input.line_items.some(item => !item.product_id || item.quantity == null || item.quantity <= 0)) {
       console.error('Validation failed: Invalid line item data.');
       return { success: false, message: 'Each line item must have a valid product ID and a quantity greater than 0.' };
    }
    console.log('Input validation passed.');

    try {
        // 2. Fetch Required Data
        console.log('Fetching customer, products, and seller profile...');
        const [customer, sellerProfile, productsResult] = await Promise.all([
            getCustomerById(input.customer_id),
            getSellerProfile(),
            Promise.allSettled(input.line_items.map(item => getProductById(item.product_id)))
        ]);

        // Check Customer
        if (!customer) {
            console.error(`Customer not found: ${input.customer_id}`);
            return { success: false, message: `Customer with ID ${input.customer_id} not found.` };
        }

        // Process Products Results
        const missingProductIds: string[] = [];
        const validProducts: Product[] = [];
        productsResult.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                validProducts.push(result.value);
            } else {
                missingProductIds.push(input.line_items[index].product_id);
                console.error(`Product fetch failed or product not found: ${input.line_items[index].product_id}`, result.status === 'rejected' ? result.reason : 'Not found');
            }
        });

        if (missingProductIds.length > 0) {
            console.error(`Failed to fetch products: ${missingProductIds.join(', ')}`);
            return { success: false, message: `Product(s) not found or failed to load: ${missingProductIds.join(', ')}.` };
        }
        console.log('Fetched all required data successfully.');


        // 3. Perform Calculations
        console.log('Calculating totals...');
        const calculationResult = calculateInvoiceTotals(input.line_items, validProducts, input.include_gst);
        console.log('Calculations complete:', calculationResult);

        // 4. Determine Invoice Type (Tax Invoice / Invoice)
        console.log('Determining invoice type...');
        // Threshold is $82.50 *inclusive* of GST
        const totalAmount = calculationResult.total_inc_GST;
        const isTaxInvoiceRequired = (input.include_gst && totalAmount >= 82.50) || !!input.force_tax_invoice;
        console.log(`Is Tax Invoice: ${isTaxInvoiceRequired} (Total: ${totalAmount}, Force: ${!!input.force_tax_invoice})`);

        // 5. Prepare Snapshots and Create Receipt Object
        console.log('Creating receipt object with snapshots...');
        const customerSnapshot = createCustomerSnapshot(customer);
        const sellerProfileSnapshot = createSellerSnapshot(sellerProfile);
        const purchaseDate = parseISO(`${input.date_of_purchase}T00:00:00Z`); // Treat as start of day UTC

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
        console.log(`Receipt object created with ID: ${newReceipt.receipt_id}`);

        // 6. Generate PDF
        console.log(`Generating PDF for receipt ID: ${newReceipt.receipt_id}`);
        const pdfGenerationResult = await generateReceiptPdf(newReceipt);

        if (!pdfGenerationResult.success || !pdfGenerationResult.filePath) {
             // Error already logged inside generateReceiptPdf
             return { success: false, message: pdfGenerationResult.message || "Failed to generate PDF." };
        }
        console.log(`PDF generated successfully at: ${pdfGenerationResult.filePath}`);


        // 7. Save Receipt Data (only after successful PDF generation)
        console.log('Saving receipt data...');
        const allReceipts = await readReceipts();
        allReceipts.unshift(newReceipt); // Add to the beginning (most recent first)
        await writeReceipts(allReceipts);
        console.log('Receipt data saved successfully.');

        return { success: true, receipt: newReceipt, pdfPath: pdfGenerationResult.filePath };

    } catch (error: any) {
        console.error("Unhandled error during receipt creation:", error);
        return { success: false, message: error.message || 'An unexpected error occurred during receipt creation.' };
    }
}

// --- Calculation Logic (Extracted) ---

function calculateInvoiceTotals(
    inputItems: Array<{ product_id: string; quantity: number }>,
    products: Product[],
    includeGstGlobally: boolean
): {
    calculatedLineItems: LineItem[];
    subtotal_excl_GST: number;
    total_gst_amount: number;
    total_inc_GST: number;
} {
    let subtotal_excl_GST = 0;
    let total_gst_amount = 0;
    const calculatedLineItems: LineItem[] = [];

    inputItems.forEach((item) => {
        const product = products.find(p => p.id === item.product_id);
        if (!product) {
            // This case should ideally be caught earlier, but good to have defense here
            console.error(`Product missing in calculation step: ${item.product_id}`);
            return; // Skip this item
        }

        const lineTotalExclGST = product.unit_price * item.quantity;
        subtotal_excl_GST += lineTotalExclGST;

        let lineGstAmount = 0;
        // Calculate GST only if global flag is true AND product is GST applicable
        if (includeGstGlobally && product.GST_applicable) {
             lineGstAmount = lineTotalExclGST * 0.1;
             total_gst_amount += lineGstAmount;
        }

        calculatedLineItems.push({
            product_id: product.id,
            quantity: item.quantity,
            unit_price: product.unit_price,
            line_total: parseFloat(lineTotalExclGST.toFixed(2)),
            product_name: product.name, // Add name for display
            GST_applicable: product.GST_applicable, // Keep GST applicability
        });
    });

     // If includeGstGlobally is false, GST must be zero regardless of product settings
    if (!includeGstGlobally) {
        total_gst_amount = 0;
    }

    const total_inc_GST = subtotal_excl_GST + total_gst_amount;

    return {
        calculatedLineItems,
        subtotal_excl_GST: parseFloat(subtotal_excl_GST.toFixed(2)),
        total_gst_amount: parseFloat(total_gst_amount.toFixed(2)),
        total_inc_GST: parseFloat(total_inc_GST.toFixed(2)),
    };
}

// --- Snapshot Creation (Extracted) ---

function createCustomerSnapshot(customer: Customer): Omit<Customer, 'id'> {
    return {
        customer_type: customer.customer_type,
        first_name: customer.first_name,
        last_name: customer.last_name,
        business_name: customer.business_name,
        abn: customer.abn,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
    };
}

function createSellerSnapshot(sellerProfile: SellerProfile): SellerProfile {
    // Ensure all fields are present, using defaults if necessary (though getSellerProfile should handle this)
    return {
        name: sellerProfile.name || 'N/A',
        business_address: sellerProfile.business_address || 'N/A',
        ABN_or_ACN: sellerProfile.ABN_or_ACN || 'N/A',
        contact_email: sellerProfile.contact_email || 'N/A',
        phone: sellerProfile.phone || '', // Ensure string
        logo_url: sellerProfile.logo_url || '', // Ensure string
    };
}


// --- PDF Generation (Modular Functions) ---

function addHeader(doc: PDFKit.PDFDocument, isTaxInvoice: boolean) {
    doc.fontSize(20).text(isTaxInvoice ? 'TAX INVOICE' : 'INVOICE', { align: 'center' });
    doc.moveDown();
}

function addSellerInfo(doc: PDFKit.PDFDocument, seller: SellerProfile) {
    doc.fontSize(12).text('From:', { underline: true });
    doc.fontSize(10);
    doc.text(seller.name, { continued: false }); // Ensure each starts on new line
    doc.text(seller.business_address, { continued: false });
    doc.text(`ABN/ACN: ${seller.ABN_or_ACN}`, { continued: false });
    doc.text(`Email: ${seller.contact_email}`, { continued: false });
    if (seller.phone) {
        doc.text(`Phone: ${seller.phone}`, { continued: false });
    }
    doc.moveDown();
}

function addCustomerInfo(doc: PDFKit.PDFDocument, customer: Omit<Customer, 'id'>) {
    doc.fontSize(12).text('To:', { underline: true });
    doc.fontSize(10);
    if (customer.customer_type === 'business') {
        doc.text(customer.business_name || 'N/A', { continued: false });
        if (customer.abn) {
            doc.text(`ABN: ${customer.abn}`, { continued: false });
        }
        if (customer.first_name || customer.last_name) {
            doc.text(`Contact: ${customer.first_name || ''} ${customer.last_name || ''}`.trim(), { continued: false });
        }
    } else {
        doc.text(`${customer.first_name || ''} ${customer.last_name || ''}`.trim(), { continued: false });
    }
    // Safely access optional fields
    doc.text(`Email: ${customer.email || 'N/A'}`, { continued: false });
    doc.text(`Phone: ${customer.phone || 'N/A'}`, { continued: false });
    doc.text(`Address: ${customer.address || 'N/A'}`, { continued: false });
    doc.moveDown();
}


function addReceiptDetails(doc: PDFKit.PDFDocument, receiptId: string, date: string) {
    doc.fontSize(10).text(`Invoice ID: ${receiptId}`); // Changed Receipt ID to Invoice ID
    try {
        const formattedDate = format(parseISO(date), 'dd/MM/yyyy');
        doc.text(`Date: ${formattedDate}`);
    } catch (e) {
        console.warn(`Could not parse date for PDF: ${date}`, e);
        doc.text(`Date: ${date}`); // Fallback to original string
    }
    doc.moveDown();
}

function addLineItemsTable(doc: PDFKit.PDFDocument, lineItems: LineItem[], includeGstColumn: boolean) {
    const tableTop = doc.y;
    const startX = 50;
    const endX = 550;
    const itemCol = startX;
    const gstCol = 250; // Adjusted position
    const qtyCol = 320; // Adjusted position
    const priceCol = 400; // Adjusted position
    const totalCol = 480; // Adjusted position

    const itemWidth = gstCol - itemCol - 10;
    const gstWidth = includeGstColumn ? qtyCol - gstCol - 10 : 0;
    const qtyWidth = priceCol - (includeGstColumn ? qtyCol : gstCol) - 10; // Adjust based on GST col presence
    const priceWidth = totalCol - priceCol - 10;
    const totalWidth = endX - totalCol;

    doc.fontSize(10).font('Helvetica-Bold'); // Use bold font for header
    doc.text('Item', itemCol, tableTop, { width: itemWidth, underline: true });
    if (includeGstColumn) doc.text('GST?', gstCol, tableTop, { width: gstWidth, underline: true, align: 'center' });
    doc.text('Qty', includeGstColumn ? qtyCol : gstCol, tableTop, { width: qtyWidth, underline: true, align: 'right' }); // Adjust position
    doc.text('Unit Price', priceCol, tableTop, { width: priceWidth, underline: true, align: 'right' });
    doc.text('Line Total', totalCol, tableTop, { width: totalWidth, underline: true, align: 'right' });
    doc.moveDown(0.5); // Space after header
    doc.font('Helvetica'); // Revert to regular font

    const tableBottom = doc.page.height - doc.page.margins.bottom - 50; // Reserve space for totals

    lineItems.forEach(item => {
        let y = doc.y;
        if (y > tableBottom) { // Check for page break
             doc.addPage();
             y = doc.page.margins.top; // Reset y to top margin
             // Optionally redraw header on new page
             // addLineItemsTableHeader(doc, includeGstColumn); // Need a separate header function
        }

        const unitPriceExGST = item.unit_price ?? 0; // Use nullish coalescing for safety
        const lineTotalExGST = item.line_total ?? 0;

        doc.text(item.product_name || 'N/A', itemCol, y, { width: itemWidth });
        if (includeGstColumn) doc.text(item.GST_applicable ? 'Yes' : 'No', gstCol, y, { width: gstWidth, align: 'center' });
        doc.text(item.quantity.toString(), includeGstColumn ? qtyCol : gstCol, y, { width: qtyWidth, align: 'right' }); // Adjust position
        doc.text(`$${unitPriceExGST.toFixed(2)}`, priceCol, y, { width: priceWidth, align: 'right' });
        doc.text(`$${lineTotalExGST.toFixed(2)}`, totalCol, y, { width: totalWidth, align: 'right' });
        doc.moveDown(0.5);
    });
    doc.moveDown();

    // Draw a line before totals
    doc.moveTo(startX, doc.y).lineTo(endX, doc.y).strokeColor('#cccccc').stroke(); // Lighter stroke
    doc.moveDown(0.5);
}


function addTotals(doc: PDFKit.PDFDocument, subtotal: number, gstAmount: number, total: number) {
    const totalsX = 400; // Start position for amounts
    const labelX = 50; // Start position for labels
    const endX = 550; // Right edge for alignment/lines

    doc.fontSize(10).font('Helvetica'); // Regular font for labels
    doc.text(`Subtotal (ex GST):`, labelX, doc.y, { continued: true, align: 'left' });
    doc.font('Helvetica').text(`$${subtotal.toFixed(2)}`, totalsX, doc.y, { align: 'right', width: endX - totalsX });

    doc.text(`GST Amount:`, labelX, doc.y, { continued: true, align: 'left' });
    doc.text(`$${gstAmount.toFixed(2)}`, totalsX, doc.y, { align: 'right', width: endX - totalsX });

    // Draw another line
    const lineY = doc.y + 15;
    doc.moveTo(totalsX - 50, lineY).lineTo(endX, lineY).strokeColor('#aaaaaa').stroke(); // Slightly darker line
    doc.moveDown(0.5); // Move down after line

    doc.font('Helvetica-Bold'); // Bold font for total label
    doc.fontSize(12).text(`Total (inc GST):`, labelX, doc.y, { continued: true, align: 'left'});
    doc.font('Helvetica-Bold').text(`$${total.toFixed(2)}`, totalsX, doc.y, { align: 'right', width: endX - totalsX });
    doc.moveDown();
    doc.font('Helvetica'); // Revert font
}


// Main PDF Generation Orchestrator
export async function generateReceiptPdf(receipt: Receipt): Promise<{ success: boolean; message?: string; filePath?: string }> {
    const filename = `${receipt.receipt_id}.pdf`;
    const filePath = path.join(PDF_DIR, filename);
    let writeStream: fs.WriteStream | null = null;
    let doc: PDFKit.PDFDocument | null = null;
    let success = false;

    try {
        writeStream = fs.createWriteStream(filePath);
        doc = new PDFDocument({ margin: 50, bufferPages: true }); // Enable buffering

        // --- Event Handling for Stream/Doc ---
        const streamFinishPromise = new Promise<void>((resolve, reject) => {
            writeStream!.on('finish', () => {
                console.log(`PDF stream finished for ${filename}`);
                success = true; // Mark success only on finish
                resolve();
            });
            writeStream!.on('error', (err) => {
                console.error(`PDF stream error for ${filename}:`, err);
                reject(new Error(`PDF stream error: ${err.message}`));
            });
            doc!.on('error', (err) => { // Listen for errors on the document itself
                console.error(`PDF document error for ${filename}:`, err);
                reject(new Error(`PDF document error: ${err.message}`));
             });
        });

        doc.pipe(writeStream);

        // --- Add Content ---
        console.log(`Adding content to PDF: ${filename}`);
        // Use a known available font
        doc.font('Helvetica');

        addHeader(doc, receipt.is_tax_invoice);
        addSellerInfo(doc, receipt.seller_profile_snapshot);
        addCustomerInfo(doc, receipt.customer_snapshot);
        addReceiptDetails(doc, receipt.receipt_id, receipt.date_of_purchase);
        // Only show GST column if GST was actually applied (amount > 0)
        addLineItemsTable(doc, receipt.line_items, receipt.GST_amount > 0);
        addTotals(doc, receipt.subtotal_excl_GST, receipt.GST_amount, receipt.total_inc_GST);

        // --- Finalize Document ---
        console.log(`Finalizing PDF document: ${filename}`);
        doc.end(); // This triggers the 'finish' event on the stream eventually

        // --- Wait for Completion ---
        await streamFinishPromise; // Wait for the stream to finish or error out

        console.log(`PDF generation process completed for: ${filename}. Success: ${success}`);
        return { success: true, filePath: filePath };

    } catch (error: any) {
        console.error(`Unhandled error during PDF generation for ${filename}:`, error);
        // Cleanup potentially created doc/stream and file
        await cleanupFailedPdf(doc, writeStream, filePath);
        return { success: false, message: `Failed to generate PDF: ${error.message}` };
    } finally {
        // Ensure stream is closed if it exists and wasn't closed by an error handler already
        if (writeStream && !writeStream.writableEnded && !success) {
            console.log(`Force closing stream for ${filename} in finally block.`);
            writeStream.end();
        }
    }
}

// Helper for cleaning up failed PDF generation
async function cleanupFailedPdf(
    doc: PDFKit.PDFDocument | null,
    stream: fs.WriteStream | null,
    filePath: string
) {
    console.warn(`Cleaning up failed PDF generation for: ${filePath}`);
    try {
        // Close stream if open
        if (stream && !stream.writableEnded) {
            stream.end();
        }
        // Try to delete the potentially corrupted/incomplete file
        try {
            await fs.access(filePath); // Check if file exists
            await fs.unlink(filePath); // Delete the file
            console.log(`Deleted incomplete/corrupted PDF: ${filePath}`);
        } catch (accessOrUnlinkError: any) {
             if (accessOrUnlinkError.code !== 'ENOENT') { // Ignore if the file doesn't exist
                 console.error(`Error accessing or deleting potentially corrupted PDF ${filePath}:`, accessOrUnlinkError);
             } else {
                 console.log(`Incomplete PDF ${filePath} did not exist, no need to delete.`);
             }
        }
    } catch (cleanupError) {
        console.error(`Error during PDF cleanup for ${filePath}:`, cleanupError);
    }
}


// --- PDF Retrieval Actions ---
export async function getReceiptPdfPath(receiptId: string): Promise<string | null> {
    const receipt = await getReceiptById(receiptId); // Needs getReceiptById defined elsewhere
    if (!receipt) {
        console.log(`Receipt not found for ID: ${receiptId}`);
        return null;
    }

    const pdfPath = path.join(PDF_DIR, `${receipt.receipt_id}.pdf`);
    try {
        await fs.access(pdfPath);
        console.log(`PDF path found for receipt ${receiptId}: ${pdfPath}`);
        return pdfPath;
    } catch (error) {
        console.error(`PDF file not found or inaccessible for receipt ${receiptId} at ${pdfPath}`);
        // Optional: Could attempt regeneration here if needed
        // const regenResult = await generateReceiptPdf(receipt);
        // if (regenResult.success) return regenResult.filePath;
        return null;
    }
}

// Added helper function to get receipt by ID, assuming it's similar to customers/products
async function getReceiptById(id: string): Promise<Receipt | null> {
    const receipts = await readReceipts();
    const receipt = receipts.find(r => r.receipt_id === id);
    return receipt || null;
}


export async function getReceiptPdfContent(receiptId: string): Promise<Buffer | null> {
     const pdfPath = await getReceiptPdfPath(receiptId);
     if (!pdfPath) return null;

     try {
         const pdfContent = await fs.readFile(pdfPath);
         console.log(`Successfully read PDF content for receipt ${receiptId}`);
         return pdfContent;
     } catch (error) {
         console.error(`Error reading PDF content for receipt ${receiptId}:`, error);
         return null;
     }
}
