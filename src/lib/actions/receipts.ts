// src/lib/actions/receipts.ts
'use server';

import { Receipt, LineItem, Product, SellerProfile, Customer } from '@/lib/types';
import { createReceipt as createReceiptData, getAllReceipts as getAllReceiptsData, getReceiptById as getReceiptByIdData } from '@/lib/data-access/receipts';
import { getAllProducts } from '@/lib/data-access/products';
import { getSellerProfile } from '@/lib/data-access/seller';
import { getCustomerById } from '@/lib/data-access/customers';
import { v4 as uuidv4 } from 'uuid';
// Import both generators
import { PdfGenerator } from '@/lib/services/pdfGenerator';
import { PuppeteerPdfGenerator } from '@/lib/services/puppeteerPdfGenerator'; // Import the new generator
import { logger } from '@/lib/services/logging';

const ACTION_LOG_PREFIX = 'ReceiptActions';

// Choose which generator to use (e.g., based on an environment variable or config)
// For simplicity, let's add a parameter to choose. Default to original PdfKit.
const USE_PUPPETEER_PDF = process.env.PDF_GENERATOR === 'puppeteer'; // Example using env var

// Result structure for the action
interface CreateReceiptResult {
    success: boolean; // Overall success (including data saving)
    message?: string; // General message or data saving error message
    receipt?: { receipt_id: string }; // Return minimal receipt info if data saved
    pdfGenerated: boolean; // Indicates if PDF generation step was successful
    pdfPath?: string; // Path on the server (only if pdfGenerated is true)
    pdfError?: string; // Specific PDF generation error message (only if pdfGenerated is false but success is true)
}

// Input parameters for the action
interface SubmissionLineItem {
    product_id: string;
    quantity: number;
}

interface CreateReceiptParams {
    customer_id: string;
    date_of_purchase: string; // Expecting 'yyyy-MM-dd' from the form
    line_items: SubmissionLineItem[];
    include_gst: boolean;
    force_tax_invoice: boolean;
}


export async function createReceipt(data: CreateReceiptParams): Promise<CreateReceiptResult> {
    const operationId = uuidv4().substring(0, 8); // Unique ID for this operation flow
    const pdfGeneratorChoice = USE_PUPPETEER_PDF ? 'Puppeteer' : 'PDFKit';
    const funcPrefix = `${ACTION_LOG_PREFIX}:createReceipt:${operationId} [${pdfGeneratorChoice}]`;
    let newReceipt: Receipt | null = null; // Hold the receipt data for PDF generation

    logger.info(funcPrefix, 'Starting createReceipt action execution.', {customerId: data.customer_id, date: data.date_of_purchase, itemCount: data.line_items.length});

    try {
        // --- Step 1: Fetch required data ---
        logger.debug(funcPrefix, 'Fetching products, seller profile, and customer data concurrently.');
        const [products, sellerProfile, customer] = await Promise.all([
            getAllProducts(),
            getSellerProfile(),
            getCustomerById(data.customer_id),
        ]);
        logger.debug(funcPrefix, `Fetched ${products.length} products, seller profile ${sellerProfile ? 'found' : 'not found'}, customer ${customer ? 'found' : 'not found'}.`);

        // --- Step 2: Validate fetched data ---
        if (!products || products.length === 0) {
            logger.warn(funcPrefix, 'Validation failed: No products found in data access.');
            return { success: false, message: 'Cannot create invoice: No products defined in the system.', pdfGenerated: false };
        }
        if (!sellerProfile) {
            logger.warn(funcPrefix, 'Validation failed: Seller profile not found.');
            return { success: false, message: 'Cannot create invoice: Seller profile is not configured.', pdfGenerated: false };
        }
        if (!customer) {
            logger.warn(funcPrefix, `Validation failed: Customer not found for ID: ${data.customer_id}`);
            return { success: false, message: `Cannot create invoice: Customer with ID ${data.customer_id} not found.`, pdfGenerated: false };
        }

        // --- Step 3: Process Line Items and Calculate Totals ---
        logger.debug(funcPrefix, 'Processing line items and calculating totals.');
        const lineItems: LineItem[] = [];
        let subtotalExclGST = 0;
        let GSTAmount = 0;

        for (const item of data.line_items) {
            const product = products.find((p) => p.id === item.product_id);
            if (!product) {
                logger.error(funcPrefix, `Data inconsistency: Product with ID ${item.product_id} from input not found in fetched products.`);
                // Note: This validation could technically happen client-side too, but good to have server-side check.
                return { success: false, message: `Product with ID ${item.product_id} not found. Please refresh products and try again.`, pdfGenerated: false };
            }
            const lineTotal = product.unit_price * item.quantity;
            lineItems.push({
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: product.unit_price,
                line_total: lineTotal,
                product_name: product.name, // Capture name at time of sale
                description: product.description || '', // Capture description
                GST_applicable: product.GST_applicable,
            });

            subtotalExclGST += lineTotal;
            if (data.include_gst && product.GST_applicable) {
                GSTAmount += lineTotal * 0.1; // Calculate GST based on product applicability
            }
        }

        if (!data.include_gst) {
            GSTAmount = 0; // Ensure GST is zero if not included
        }

        // Ensure calculations are rounded to 2 decimal places
        subtotalExclGST = parseFloat(subtotalExclGST.toFixed(2));
        GSTAmount = parseFloat(GSTAmount.toFixed(2));
        const totalIncGST = parseFloat((subtotalExclGST + GSTAmount).toFixed(2));

        // Determine if it's a Tax Invoice
        const isTaxInvoice = data.force_tax_invoice || (data.include_gst && totalIncGST >= 82.50);
        logger.debug(funcPrefix, `Calculated Totals: Subtotal=${subtotalExclGST}, GST=${GSTAmount}, Total=${totalIncGST}, IsTaxInvoice=${isTaxInvoice}`);

        // --- Step 4: Create Receipt Object ---
         newReceipt = { // Assign to the outer scope variable
            receipt_id: uuidv4(),
            customer_id: data.customer_id,
            date_of_purchase: data.date_of_purchase,
            line_items: lineItems,
            subtotal_excl_GST: subtotalExclGST,
            GST_amount: GSTAmount,
            total_inc_GST: totalIncGST,
            is_tax_invoice: isTaxInvoice,
            seller_profile_snapshot: sellerProfile, // Snapshot seller details
            customer_snapshot: { // Snapshot customer details
                id: customer.id,
                customer_type: customer.customer_type,
                first_name: customer.first_name,
                last_name: customer.last_name,
                business_name: customer.business_name,
                abn: customer.abn,
                email: customer.email,
                phone: customer.phone,
                address: customer.address,
            },
        };
        logger.debug(funcPrefix, `Constructed new receipt object with ID: ${newReceipt.receipt_id}`);

        // --- Step 5: Save Receipt Data ---
        logger.debug(funcPrefix, `Attempting to save receipt data for ID: ${newReceipt.receipt_id}`);
        const createdReceipt = await createReceiptData(newReceipt);
        if (!createdReceipt) {
            logger.error(funcPrefix, 'Data access layer failed to save the receipt.');
            // Do not attempt PDF generation if data saving failed
            return { success: false, message: 'Failed to save invoice data.', pdfGenerated: false };
        }
        logger.info(funcPrefix, `Receipt data saved successfully for ID: ${newReceipt.receipt_id}`);

        // --- Step 6: Attempt PDF Generation (ONLY if data saving was successful) ---
        logger.info(funcPrefix, `Initiating PDF generation using ${pdfGeneratorChoice} for receipt ID: ${newReceipt.receipt_id}`);
        let pdfResult;
        try {
            if (USE_PUPPETEER_PDF) {
                const puppeteerGenerator = new PuppeteerPdfGenerator();
                pdfResult = await puppeteerGenerator.generate(newReceipt, operationId);
            } else {
                const pdfkitGenerator = new PdfGenerator();
                pdfResult = await pdfkitGenerator.generate(newReceipt, operationId);
            }

            if (pdfResult.success) {
                logger.info(funcPrefix, `PDF generated successfully using ${pdfGeneratorChoice}. Path: ${pdfResult.filePath}`);
                return {
                    success: true, // Data saved, PDF generated
                    receipt: { receipt_id: newReceipt.receipt_id },
                    pdfGenerated: true,
                    pdfPath: pdfResult.filePath,
                };
            } else {
                 const pdfErrorMessage = pdfResult.message || `Unknown ${pdfGeneratorChoice} PDF generation error.`;
                 logger.error(funcPrefix, `PDF generation failed using ${pdfGeneratorChoice}. Reason: ${pdfErrorMessage}`);
                // Data was saved, but PDF failed
                return {
                    success: true,
                    receipt: { receipt_id: newReceipt.receipt_id },
                    pdfGenerated: false,
                    pdfError: pdfErrorMessage,
                };
            }
        } catch (pdfGenError: any) {
            const pdfErrorMessage = pdfGenError.message || `Unexpected ${pdfGeneratorChoice} PDF generation error.`;
            logger.error(funcPrefix, `Critical error during PDF generation call for ${pdfGeneratorChoice}`, pdfGenError);
             // Data was saved, but PDF generation threw an unexpected error
            return {
                success: true,
                receipt: { receipt_id: newReceipt.receipt_id },
                pdfGenerated: false,
                pdfError: pdfErrorMessage,
            };
        }

    } catch (error) {
        // Catch errors from Steps 1-5 (data fetching, validation, calculation, saving)
        logger.error(funcPrefix, 'An unexpected error occurred before PDF generation attempt', error);
        let errorMessage = 'An unexpected error occurred during invoice creation.';
        if (error instanceof Error) {
            errorMessage += `: ${error.message}`;
        }
        return {
            success: false, // Overall failure
            message: errorMessage,
            pdfGenerated: false, // PDF was not attempted or failed implicitly
        };
    }
}

export async function getAllReceipts(): Promise<Receipt[]> {
    const funcPrefix = `${ACTION_LOG_PREFIX}:getAllReceipts`;
    logger.debug(funcPrefix, 'Executing getAllReceipts server action.');
    try {
        const receipts = await getAllReceiptsData();
        // Sort receipts by date descending (most recent first)
        receipts.sort((a, b) => new Date(b.date_of_purchase).getTime() - new Date(a.date_of_purchase).getTime());
        logger.info(funcPrefix, `Retrieved and sorted ${receipts.length} receipts.`);
        return receipts;
    } catch (error) {
        logger.error(funcPrefix, 'Error getting all receipts', error);
        return []; // Return empty array on error
    }
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
    const funcPrefix = `${ACTION_LOG_PREFIX}:getReceiptById:${id}`;
    logger.debug(funcPrefix, 'Executing getReceiptById server action.');
    try {
        const receipt = await getReceiptByIdData(id);
        if (receipt) {
            logger.info(funcPrefix, `Receipt found.`);
        } else {
             logger.info(funcPrefix, `Receipt not found.`);
        }
        return receipt;
    } catch (error) {
        logger.error(funcPrefix, `Error getting receipt by ID ${id}`, error);
        return null; // Return null on error
    }
}
