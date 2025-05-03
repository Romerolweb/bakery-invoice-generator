// src/lib/actions/receipts.ts
'use server';

import type { Receipt, LineItem, Customer, Product, SellerProfile } from '@/lib/types';
import { promises as fs } from 'fs';
import type { WriteStream } from 'fs'; // Import WriteStream type
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
        console.log(`Ensuring data directory exists: ${DATA_DIR}`);
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log(`Ensuring PDF directory exists: ${PDF_DIR}`);
        await fs.mkdir(PDF_DIR, { recursive: true });
        console.log('Data directories ensured successfully.');
    } catch (error) {
        console.error('FATAL: Error creating data/PDF directories:', error);
        throw new Error(`Failed to ensure data directories exist: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read receipts data
export async function readReceipts(): Promise<Receipt[]> {
  let fileContent;
  try {
    console.log(`Attempting to ensure directories before reading receipts...`);
    await ensureDirectoriesExist(); // Ensure directory exists before reading
    console.log(`Attempting to read receipts file: ${RECEIPTS_FILE}`);
    fileContent = await fs.readFile(RECEIPTS_FILE, 'utf-8');
    const receipts = JSON.parse(fileContent);
    console.log(`Successfully read and parsed ${receipts.length} receipts.`);
    return receipts;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(`Receipts file (${RECEIPTS_FILE}) not found, returning empty array.`);
      return [];
    } else if (error instanceof SyntaxError) {
        console.error(`Error parsing JSON from ${RECEIPTS_FILE}. Content: "${fileContent ? fileContent.substring(0,100)+'...' : 'empty'}"`, error);
        throw new Error(`Could not parse receipts data: Invalid JSON format.`);
    }
    console.error(`Error reading receipts file (${RECEIPTS_FILE}):`, error);
    throw new Error(`Could not load receipts: ${error.message}`);
  }
}

// Helper function to write receipts data
export async function writeReceipts(receipts: Receipt[]): Promise<void> {
  try {
    console.log(`Attempting to ensure directories before writing receipts...`);
    await ensureDirectoriesExist(); // Ensure directory exists before writing
    const dataToWrite = JSON.stringify(receipts, null, 2);
    console.log(`Attempting to write ${receipts.length} receipts to file: ${RECEIPTS_FILE}`);
    await fs.writeFile(RECEIPTS_FILE, dataToWrite, 'utf-8');
    console.log(`Successfully wrote receipts data.`);
  } catch (error: any) {
    console.error(`Error writing receipts file (${RECEIPTS_FILE}):`, error);
    throw new Error(`Failed to save receipts: ${error.message}`);
  }
}

// Run directory check once on module load (can still be called explicitly if needed)
ensureDirectoriesExist().catch(err => {
    console.error("Initial directory check failed on module load:", err);
    // Depending on severity, you might want to prevent the app from starting fully
});


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
    console.log(`[${operationId}] Starting receipt creation for customer ${input.customer_id}`);

    // 0. Ensure directories exist (critical before any file ops)
    try {
        await ensureDirectoriesExist();
    } catch (dirError: any) {
        console.error(`[${operationId}] Directory creation/verification failed:`, dirError);
        return { success: false, message: `Failed to prepare storage: ${dirError.message}` };
    }

    // 1. Validation
    console.log(`[${operationId}] Validating input:`, JSON.stringify(input));
    if (!input.customer_id || !input.line_items || input.line_items.length === 0) {
        console.error(`[${operationId}] Validation failed: Missing customer or line items.`);
        return { success: false, message: 'Customer and at least one line item are required.' };
    }
    if (input.line_items.some(item => !item.product_id || item.quantity == null || item.quantity <= 0)) {
       console.error(`[${operationId}] Validation failed: Invalid line item data.`, input.line_items);
       return { success: false, message: 'Each line item must have a valid product ID and a quantity greater than 0.' };
    }
    console.log(`[${operationId}] Input validation passed.`);

    try {
        // 2. Fetch Required Data
        console.log(`[${operationId}] Fetching customer, products, and seller profile...`);
        const [customerResult, sellerProfileResult, productsResult] = await Promise.allSettled([
            getCustomerById(input.customer_id),
            getSellerProfile(),
            Promise.allSettled(input.line_items.map(item => getProductById(item.product_id)))
        ]);

        // Check Seller Profile
        if (sellerProfileResult.status === 'rejected') {
            console.error(`[${operationId}] Failed to fetch seller profile:`, sellerProfileResult.reason);
            return { success: false, message: `Failed to load seller profile: ${sellerProfileResult.reason?.message || 'Unknown error'}` };
        }
        const sellerProfile = sellerProfileResult.value;
         if (!sellerProfile?.name || !sellerProfile?.ABN_or_ACN || !sellerProfile?.business_address) {
             console.error(`[${operationId}] Seller profile is incomplete:`, sellerProfile);
             return { success: false, message: 'Seller profile is incomplete. Please configure it in Settings.' };
         }

        // Check Customer
         if (customerResult.status === 'rejected') {
             console.error(`[${operationId}] Failed to fetch customer ${input.customer_id}:`, customerResult.reason);
             return { success: false, message: `Failed to load customer: ${customerResult.reason?.message || 'Unknown error'}` };
         }
         const customer = customerResult.value;
        if (!customer) {
            console.error(`[${operationId}] Customer not found: ${input.customer_id}`);
            return { success: false, message: `Customer with ID ${input.customer_id} not found.` };
        }

        // Process Products Results
        if (productsResult.status === 'rejected') {
             console.error(`[${operationId}] Unexpected error fetching products array:`, productsResult.reason);
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
                console.error(`[${operationId}] Product fetch failed or product not found: ${productId}`, result.status === 'rejected' ? result.reason : 'Not found');
            }
        });

        if (missingProductIds.length > 0) {
            console.error(`[${operationId}] Failed to fetch products: ${missingProductIds.join(', ')}`);
            return { success: false, message: `Product(s) not found or failed to load: ${missingProductIds.join(', ')}.` };
        }
        console.log(`[${operationId}] Fetched all required data successfully.`);


        // 3. Perform Calculations
        console.log(`[${operationId}] Calculating totals...`);
        const calculationResult = calculateInvoiceTotals(input.line_items, validProductsMap, input.include_gst);
        console.log(`[${operationId}] Calculations complete:`, calculationResult);

        // 4. Determine Invoice Type (Tax Invoice / Invoice)
        console.log(`[${operationId}] Determining invoice type...`);
        const totalAmount = calculationResult.total_inc_GST;
        const isTaxInvoiceRequired = (input.include_gst && totalAmount >= 82.50) || !!input.force_tax_invoice;
        console.log(`[${operationId}] Is Tax Invoice: ${isTaxInvoiceRequired} (Total: ${totalAmount}, IncludeGST: ${input.include_gst}, Force: ${!!input.force_tax_invoice})`);

        // 5. Prepare Snapshots and Create Receipt Object
        console.log(`[${operationId}] Creating receipt object with snapshots...`);
        const customerSnapshot = createCustomerSnapshot(customer);
        const sellerProfileSnapshot = createSellerSnapshot(sellerProfile);
        let purchaseDate: Date;
        try {
            purchaseDate = parseISO(`${input.date_of_purchase}T00:00:00.000Z`);
             if (isNaN(purchaseDate.getTime())) {
                 throw new Error('Invalid date format parsed');
             }
         } catch (dateError) {
             console.error(`[${operationId}] Invalid date format provided: ${input.date_of_purchase}`, dateError);
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
        console.log(`[${operationId}] Receipt object created with ID: ${newReceipt.receipt_id}`);

        // 6. Generate PDF
        console.log(`[${operationId}] Generating PDF for receipt ID: ${newReceipt.receipt_id}`);
        const pdfGenerationResult = await generateReceiptPdf(newReceipt, operationId);

        if (!pdfGenerationResult.success || !pdfGenerationResult.filePath) {
             console.error(`[${operationId}] PDF generation failed for ${newReceipt.receipt_id}: ${pdfGenerationResult.message}`);
             // No need to cleanup here, generateReceiptPdf handles its own cleanup on failure
             return { success: false, message: pdfGenerationResult.message || "Failed to generate PDF." };
        }
        console.log(`[${operationId}] PDF generated successfully at: ${pdfGenerationResult.filePath}`);


        // 7. Save Receipt Data (only after successful PDF generation)
        console.log(`[${operationId}] Saving receipt data...`);
        const allReceipts = await readReceipts();
        allReceipts.unshift(newReceipt); // Add to the beginning (most recent first)
        await writeReceipts(allReceipts);
        console.log(`[${operationId}] Receipt data saved successfully.`);

        return { success: true, receipt: newReceipt, pdfPath: pdfGenerationResult.filePath };

    } catch (error: any) {
        console.error(`[${operationId}] Unhandled error during receipt creation for customer ${input.customer_id}:`, error);
         return { success: false, message: `An unexpected error occurred during invoice creation: ${error.message || 'Unknown error. Check server logs.'}` };
    }
}

// --- Calculation Logic (Extracted) ---

function calculateInvoiceTotals(
    inputItems: Array<{ product_id: string; quantity: number }>,
    productsMap: Map<string, Product>,
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
        const product = productsMap.get(item.product_id);
        if (!product) {
            console.error(`Calculation Error: Product missing ${item.product_id}. This should not happen if pre-fetch validation passed.`);
            // Skip this item or throw error depending on strictness needed
            return;
        }

        const lineTotalExclGST = product.unit_price * item.quantity;
        subtotal_excl_GST += lineTotalExclGST;

        let lineGstAmount = 0;
        if (includeGstGlobally && product.GST_applicable) {
             lineGstAmount = lineTotalExclGST * 0.1;
             total_gst_amount += lineGstAmount;
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
    return {
        name: sellerProfile.name || 'N/A',
        business_address: sellerProfile.business_address || 'N/A',
        ABN_or_ACN: sellerProfile.ABN_or_ACN || 'N/A',
        contact_email: sellerProfile.contact_email || 'N/A',
        phone: sellerProfile.phone || '',
        logo_url: sellerProfile.logo_url || '',
    };
}


// --- PDF Generation (Modular Functions) ---

// Type alias for PDFDocument instance using the static import
type PDFDocumentInstance = InstanceType<typeof PDFDocument>;


function addHeader(doc: PDFDocumentInstance, isTaxInvoice: boolean) {
    doc.fontSize(20).font('Helvetica-Bold').text(isTaxInvoice ? 'TAX INVOICE' : 'INVOICE', { align: 'center' });
    doc.font('Helvetica'); // Revert to regular
    doc.moveDown();
}

function addSellerInfo(doc: PDFDocumentInstance, seller: SellerProfile) {
    doc.fontSize(12).text('From:', { underline: true });
    doc.fontSize(10);
    doc.text(seller.name || 'Seller Name Missing');
    doc.text(seller.business_address || 'Seller Address Missing');
    doc.text(`ABN/ACN: ${seller.ABN_or_ACN || 'Seller ABN/ACN Missing'}`);
    doc.text(`Email: ${seller.contact_email || 'Seller Email Missing'}`);
    if (seller.phone) {
        doc.text(`Phone: ${seller.phone}`);
    }
    doc.moveDown();
}

function addCustomerInfo(doc: PDFDocumentInstance, customer: Omit<Customer, 'id'>) {
    doc.fontSize(12).text('To:', { underline: true });
    doc.fontSize(10);
    if (customer.customer_type === 'business') {
        doc.text(customer.business_name || 'Business Name Missing');
        if (customer.abn) {
            doc.text(`ABN: ${customer.abn}`);
        }
        const contactName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
        if (contactName) {
            doc.text(`Contact: ${contactName}`);
        }
    } else {
        const individualName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
        doc.text(individualName || 'Customer Name Missing');
    }
    doc.text(`Email: ${customer.email || 'N/A'}`);
    doc.text(`Phone: ${customer.phone || 'N/A'}`);
    doc.text(`Address: ${customer.address || 'N/A'}`);
    doc.moveDown();
}


function addReceiptDetails(doc: PDFDocumentInstance, receiptId: string, dateIsoString: string) {
    doc.fontSize(10);
    doc.text(`Invoice ID: ${receiptId}`);
    try {
        const dateObject = parseISO(dateIsoString);
        if (isNaN(dateObject.getTime())) {
            throw new Error('Invalid date object after parsing');
        }
        const formattedDate = format(dateObject, 'dd/MM/yyyy');
        doc.text(`Date: ${formattedDate}`);
    } catch (e) {
        console.warn(`Could not parse or format date for PDF: ${dateIsoString}`, e);
        doc.text(`Date: ${dateIsoString}`);
    }
    doc.moveDown();
}

function drawTableHeader(doc: PDFDocumentInstance, includeGstColumn: boolean, y: number, startX: number, endX: number) {
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

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', itemCol, y, { width: itemWidth, underline: true });
    if (includeGstColumn) doc.text('GST?', gstCol, y, { width: gstWidth, underline: true, align: 'center' });
    doc.text('Qty', includeGstColumn ? qtyCol : gstCol, y, { width: qtyWidth, underline: true, align: 'right' });
    doc.text('Unit Price', priceCol, y, { width: priceWidth, underline: true, align: 'right' });
    doc.text('Line Total', totalCol, y, { width: totalWidth, underline: true, align: 'right' });
    doc.moveDown(0.5);
    doc.font('Helvetica');
}


function addLineItemsTable(doc: PDFDocumentInstance, lineItems: LineItem[], includeGstColumn: boolean, logPrefix: string = '') {
    const tableTopInitial = doc.y;
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
    const pageBottom = doc.page.height - doc.page.margins.bottom - tableBottomMargin;

    drawTableHeader(doc, includeGstColumn, tableTopInitial, startX, endX);
    let currentY = doc.y;

    lineItems.forEach((item, index) => {
        const itemHeightEstimate = 15; // Height per line item row
        if (currentY + itemHeightEstimate > pageBottom) {
             console.log(`${logPrefix} Adding new page before item ${index + 1} at Y=${currentY}`);
             doc.addPage();
             currentY = doc.page.margins.top;
             drawTableHeader(doc, includeGstColumn, currentY, startX, endX);
             currentY = doc.y;
        }

        const unitPriceExGST = item.unit_price ?? 0;
        const lineTotalExGST = item.line_total ?? 0;

        // Ensure text calls have defined values
        doc.text(item.product_name || 'N/A', itemCol, currentY, { width: itemWidth });
        if (includeGstColumn) doc.text(item.GST_applicable ? 'Yes' : 'No', gstCol, currentY, { width: gstWidth, align: 'center' });
        doc.text(item.quantity?.toString() ?? '0', includeGstColumn ? qtyCol : gstCol, currentY, { width: qtyWidth, align: 'right' });
        doc.text(`$${unitPriceExGST.toFixed(2)}`, priceCol, currentY, { width: priceWidth, align: 'right' });
        doc.text(`$${lineTotalExGST.toFixed(2)}`, totalCol, currentY, { width: totalWidth, align: 'right' });

        // Update currentY based on the actual position after writing the text
        currentY = doc.y; // doc.y updates after text is placed
        // Add a small fixed space after each row instead of relying on moveDown's variable effect
        currentY += 5;
        doc.y = currentY; // Manually set the new start position for the next item or totals

    });

    // Ensure final Y position is set correctly
    doc.y = currentY;
    doc.moveDown(0.5); // Add a bit more space before the separator line

    // Draw a line before totals
    doc.moveTo(startX, doc.y).lineTo(endX, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);
}


function addTotals(doc: PDFDocumentInstance, subtotal: number, gstAmount: number, total: number, logPrefix: string = '') {
    const totalsX = 400;
    const labelX = 50;
    const endX = 550;
    let totalsY = doc.y; // Start position for totals

    const pageBottom = doc.page.height - doc.page.margins.bottom - 20;
    const totalsHeightEstimate = 60;

     if (totalsY + totalsHeightEstimate > pageBottom) {
         console.log(`${logPrefix} Adding new page before totals section at Y=${totalsY}`);
         doc.addPage();
         totalsY = doc.page.margins.top; // Reset Y position for the new page
         doc.y = totalsY; // Set doc's current Y
     }

    // Use consistent font and size for labels and amounts initially
    doc.fontSize(10).font('Helvetica');

    // Subtotal
    doc.text(`Subtotal (ex GST):`, labelX, totalsY, { continued: true, align: 'left' });
    doc.text(`$${subtotal.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: endX - totalsX });
    totalsY = doc.y; // Update Y after text

    // GST Amount
    doc.text(`GST Amount:`, labelX, totalsY, { continued: true, align: 'left' });
    doc.text(`$${gstAmount.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: endX - totalsX });
    totalsY = doc.y; // Update Y after text

    // Draw separator line
    const lineY = totalsY + 5; // Position line slightly below GST amount
    doc.moveTo(totalsX - 50, lineY).lineTo(endX, lineY).strokeColor('#aaaaaa').stroke();
    totalsY = lineY + 5; // Move current position below the line
    doc.y = totalsY;

    // Total - Make it bold and slightly larger
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(`Total (inc GST):`, labelX, totalsY, { continued: true, align: 'left'});
    doc.text(`$${total.toFixed(2)}`, totalsX, totalsY, { align: 'right', width: endX - totalsX });
    totalsY = doc.y; // Update Y after text

    // Revert font settings if needed later
    doc.font('Helvetica').fontSize(10);
    doc.y = totalsY; // Ensure doc.y is at the end of the totals block
    doc.moveDown();
}


// Main PDF Generation Orchestrator
export async function generateReceiptPdf(receipt: Receipt, operationId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
    const filename = `${receipt.receipt_id}.pdf`;
    const filePath = path.join(PDF_DIR, filename);
    const logPrefix = `[${operationId} PDF ${receipt.receipt_id}]`;
    let writeStream: WriteStream | null = null;
    let doc: PDFDocumentInstance | null = null;
    let success = false; // Flag to track if stream finished successfully

    console.log(`${logPrefix} Attempting to generate PDF at: ${filePath}`);

    try {
        // Ensure PDF directory exists right before writing
        await ensureDirectoriesExist();

        writeStream = fs.createWriteStream(filePath);
        doc = new PDFDocument({ margin: 50, bufferPages: true });

        const streamFinishPromise = new Promise<void>((resolve, reject) => {
            // Setup listeners *before* piping
            writeStream!.on('finish', () => {
                console.log(`${logPrefix} PDF stream finished successfully.`);
                if (!success) {
                    // This might happen if an error occurred after piping but before 'finish' was expected
                    console.warn(`${logPrefix} Stream finished, but success flag was false. Potential race condition or prior error.`);
                    // Resolve anyway, but rely on the success flag check later
                }
                success = true; // Explicitly set success on finish
                resolve();
            });
            writeStream!.on('error', (err) => {
                console.error(`${logPrefix} PDF stream error:`, err);
                success = false; // Ensure success is false on error
                reject(new Error(`PDF stream error: ${err.message}`));
            });
             doc!.on('error', (err) => {
                 console.error(`${logPrefix} PDF document error:`, err);
                 success = false; // Ensure success is false on error
                 reject(new Error(`PDF document error: ${err.message}`));
             });
        });

        // Pipe the document to the stream
        console.log(`${logPrefix} Piping PDF document to stream...`);
        doc.pipe(writeStream);

        // --- Add Content ---
        console.log(`${logPrefix} Adding content to PDF...`);
        doc.font('Helvetica');

        addHeader(doc, receipt.is_tax_invoice);
        addSellerInfo(doc, receipt.seller_profile_snapshot);
        addCustomerInfo(doc, receipt.customer_snapshot);
        addReceiptDetails(doc, receipt.receipt_id, receipt.date_of_purchase);
        addLineItemsTable(doc, receipt.line_items, receipt.GST_amount > 0, logPrefix);
        addTotals(doc, receipt.subtotal_excl_GST, receipt.GST_amount, receipt.total_inc_GST, logPrefix);

        // --- Finalize Document ---
        console.log(`${logPrefix} Finalizing PDF document (calling end())...`);
        doc.end(); // This triggers the 'finish' event on the stream eventually

        // --- Wait for Completion ---
        console.log(`${logPrefix} Waiting for stream finish promise...`);
        await streamFinishPromise;

        console.log(`${logPrefix} PDF generation process completed. Success flag: ${success}`);
        if (!success) {
             throw new Error("Stream finished or errored, but success flag was not set correctly.");
        }
        console.log(`${logPrefix} PDF generation successful.`);
        return { success: true, filePath: filePath };

    } catch (error: any) {
        console.error(`${logPrefix} ERROR during PDF generation:`, error);
        await cleanupFailedPdf(doc, writeStream, filePath, logPrefix); // Pass logPrefix

        if (error.message.includes('PDF stream error') || error.message.includes('PDF document error')) {
            // Errors already logged by listeners, just return
             return { success: false, message: `Failed to generate PDF: ${error.message}` };
        } else if (error instanceof TypeError && (error.message.includes('is not a constructor') || error.message.includes('is not a function'))) {
             console.error(`${logPrefix} PDFKit library instantiation failed. Check imports and dependencies.`);
             return { success: false, message: `Failed to generate PDF: PDF library initialization error. (${error.message})` };
        } else {
            // Generic failure message
            return { success: false, message: `Failed to generate PDF: ${error.message || 'Unknown error'}` };
        }
    }
}

// Helper for cleaning up failed PDF generation
async function cleanupFailedPdf(
    doc: PDFDocumentInstance | null,
    stream: WriteStream | null,
    filePath: string,
    logPrefix: string = '[Cleanup]' // Add log prefix parameter
) {
    console.warn(`${logPrefix} Attempting cleanup for failed PDF generation: ${filePath}`);
    try {
        // Close stream if it exists and is still open/writable
        if (stream && !stream.closed && stream.writable) {
             console.log(`${logPrefix} Closing potentially open write stream...`);
             await new Promise<void>((resolve, reject) => {
                 // Use 'close' event as 'finish' might not fire on error
                 stream.once('close', () => {
                     console.log(`${logPrefix} Stream closed event received.`);
                     resolve();
                 });
                  stream.once('error', (err) => {
                     console.error(`${logPrefix} Error closing stream during cleanup:`, err);
                     resolve(); // Resolve anyway to continue cleanup
                 });
                 // End the stream, which should trigger 'close' or 'error'
                 stream.end((err?: Error | null) => {
                     if (err) {
                        console.error(`${logPrefix} Error passed to stream.end callback:`, err);
                        // Event listener should handle rejection/resolution
                     } else {
                        console.log(`${logPrefix} stream.end callback executed successfully.`);
                     }
                 });
             });
             console.log(`${logPrefix} Finished waiting for stream close/error.`);
        } else if (stream?.closed) {
              console.log(`${logPrefix} Stream was already closed.`);
         } else if (!stream?.writable) {
            console.log(`${logPrefix} Stream was not writable.`);
        } else {
              console.log(`${logPrefix} No active/writable stream to close.`);
         }

        // Try to delete the potentially corrupted/incomplete file
         console.log(`${logPrefix} Checking existence of potentially incomplete PDF: ${filePath}`);
        try {
            await fs.access(filePath);
            console.log(`${logPrefix} Attempting to delete incomplete/corrupted PDF: ${filePath}`);
            await fs.unlink(filePath);
            console.log(`${logPrefix} Deleted incomplete/corrupted PDF: ${filePath}`);
        } catch (accessOrUnlinkError: any) {
             if (accessOrUnlinkError.code === 'ENOENT') {
                 console.log(`${logPrefix} Incomplete PDF ${filePath} did not exist, no need to delete.`);
             } else {
                 console.error(`${logPrefix} Error accessing or deleting potentially corrupted PDF during cleanup:`, accessOrUnlinkError);
             }
        }
    } catch (cleanupError) {
        console.error(`${logPrefix} Error during PDF cleanup process itself:`, cleanupError);
    }
}


// --- PDF Retrieval Actions ---
export async function getReceiptPdfPath(receiptId: string): Promise<string | null> {
    const logPrefix = `[GetPath ${receiptId}]`;
    if (!receiptId) {
        console.warn(`${logPrefix} Called with empty receiptId.`);
        return null;
    }
    const pdfPath = path.join(PDF_DIR, `${receiptId}.pdf`);
    console.log(`${logPrefix} Checking for PDF at path: ${pdfPath}`);
    try {
        await ensureDirectoriesExist();
        await fs.access(pdfPath);
        console.log(`${logPrefix} PDF path found.`);
        return pdfPath;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.warn(`${logPrefix} PDF file not found.`);
        } else {
            console.error(`${logPrefix} Error accessing PDF file:`, error);
        }
        return null;
    }
}

// Helper function to get receipt by ID
async function getReceiptById(id: string): Promise<Receipt | null> {
    if (!id) return null;
    // This function relies on readReceipts which now includes logging.
    const receipts = await readReceipts();
    const receipt = receipts.find(r => r.receipt_id === id);
    return receipt || null;
}


export async function getReceiptPdfContent(receiptId: string): Promise<Buffer | null> {
     const logPrefix = `[GetContent ${receiptId}]`;
     if (!receiptId) {
         console.warn(`${logPrefix} Called with empty receiptId.`);
         return null;
     }
     const pdfPath = await getReceiptPdfPath(receiptId); // Uses its own logging
     if (!pdfPath) {
         console.log(`${logPrefix} PDF path not found, cannot get content.`);
         return null;
     }

     try {
         console.log(`${logPrefix} Reading PDF content from path: ${pdfPath}`);
         const pdfContent = await fs.readFile(pdfPath);
         console.log(`${logPrefix} Successfully read PDF content (${pdfContent.length} bytes).`);
         return pdfContent;
     } catch (error: any) {
         console.error(`${logPrefix} Error reading PDF content from path ${pdfPath}:`, error);
         if (error.code === 'ENOENT') {
             console.error(`${logPrefix} PDF file disappeared between check and read.`);
         }
         return null;
     }
}
