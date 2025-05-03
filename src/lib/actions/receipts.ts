// src/lib/actions/receipts.ts
'use server';

import type { Receipt, LineItem, Customer, Product, SellerProfile } from '@/lib/types';
import { promises as fsPromises } from 'fs'; // Import fs promises
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getCustomerById } from './customers';
import { getProductById } from './products';
import { getSellerProfile } from './seller';
import { format, parseISO } from 'date-fns';
import { logger } from '@/lib/services/logging'; // Import the logger
import { PdfGenerator } from '@/lib/services/pdfGenerator'; // Import the new PDF service

const LOG_PREFIX = 'ReceiptsAction';

const DATA_DIR = path.join(process.cwd(), 'src/lib/data');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // PDF directory needed for getReceiptPdfPath

// --- Helper Functions ---

// Ensure necessary directories exist
async function ensureDirectoriesExist() {
    const funcPrefix = `${LOG_PREFIX}:ensureDirectoriesExist`;
    try {
        // Simplified logging as this runs often
        await fsPromises.mkdir(DATA_DIR, { recursive: true });
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
): Promise<{
    success: boolean;
    message?: string;
    receipt?: Receipt;
    pdfPath?: string; // Path if PDF generation succeeded
    pdfError?: string; // Error message if PDF generation failed
}> {
    const operationId = uuidv4().substring(0, 8); // Short ID for logging this specific operation
    const funcPrefix = `${LOG_PREFIX}:createReceipt:${operationId}`;
    logger.info(funcPrefix, `Starting invoice creation for customer ${input.customer_id}`, input);

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

    let newReceipt: Receipt | null = null; // Hold the receipt data

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
        const gstWasApplied = input.include_gst && calculationResult.total_gst_amount > 0;
        const isTaxInvoiceRequired = (gstWasApplied && totalAmount >= 82.50) || (!!input.force_tax_invoice && input.include_gst);
        logger.debug(funcPrefix, `Is Tax Invoice: ${isTaxInvoiceRequired} (Total: ${totalAmount}, IncludeGST: ${input.include_gst}, GstApplied: ${gstWasApplied}, Force: ${!!input.force_tax_invoice})`);

        // 5. Prepare Snapshots and Create Receipt Object
        logger.debug(funcPrefix, 'Creating receipt object with snapshots...');
        const customerSnapshot = createCustomerSnapshot(customer);
        const sellerProfileSnapshot = createSellerSnapshot(sellerProfile);
        let purchaseDate: Date;
        try {
            purchaseDate = parseISO(`${input.date_of_purchase}T00:00:00.000Z`);
             if (isNaN(purchaseDate.getTime())) {
                 throw new Error('Invalid date format parsed');
             }
         } catch (dateError) {
             logger.error(funcPrefix, `Invalid date format provided: ${input.date_of_purchase}`, dateError);
             return { success: false, message: `Invalid date of purchase format: ${input.date_of_purchase}. Expected YYYY-MM-DD.` };
         }


        newReceipt = {
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

        // 6. Save Receipt Data (before PDF generation)
        logger.info(funcPrefix, 'Saving receipt data...');
        const allReceipts = await readReceipts();
        allReceipts.unshift(newReceipt); // Add to the beginning (most recent first)
        await writeReceipts(allReceipts);
        logger.info(funcPrefix, 'Receipt data saved successfully.');

        // --- Post-Save: Attempt PDF Generation ---
        // Note: Even if PDF generation fails, the receipt data is already saved.
        logger.info(funcPrefix, `Attempting PDF generation for saved receipt ID: ${newReceipt.receipt_id}`);
        const pdfGenerator = new PdfGenerator(); // Instantiate the generator
        const pdfResult = await pdfGenerator.generate(newReceipt, operationId);

        if (pdfResult.success && pdfResult.filePath) {
             logger.info(funcPrefix, `PDF generated successfully for receipt ${newReceipt.receipt_id} at ${pdfResult.filePath}`);
             return { success: true, receipt: newReceipt, pdfPath: pdfResult.filePath };
        } else {
            logger.error(funcPrefix, `PDF generation failed for receipt ${newReceipt.receipt_id}: ${pdfResult.message}`);
            // Return success for data saving, but include PDF error info
            return { success: true, receipt: newReceipt, pdfError: pdfResult.message || "Unknown PDF generation error." };
        }

    } catch (error: any) {
        logger.error(funcPrefix, `Unhandled error during receipt data processing or saving for customer ${input.customer_id}`, error);
         // Return general failure if data couldn't be processed/saved
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
            return; // Skip this item
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
});
