// src/lib/actions/receipts.ts
'use server';

import { Receipt, LineItem, Product, SellerProfile, Customer } from '@/lib/types';
import { createReceipt as createReceiptData, getAllReceipts as getAllReceiptsData, getReceiptById as getReceiptByIdData } from '@/lib/data-access/receipts';
import { getAllProducts } from '@/lib/data-access/products';
import { getSellerProfile } from '@/lib/data-access/seller';
import { getCustomerById } from '@/lib/data-access/customers';
import { v4 as uuidv4 } from 'uuid';
import { PdfGenerator } from '@/lib/services/pdfGenerator'; // Import the PdfGenerator service
import { logger } from '@/lib/services/logging'; // Import logger

const ACTION_LOG_PREFIX = 'ReceiptActions';

// Result structure for the action
interface CreateReceiptResult {
    success: boolean;
    message?: string;
    receipt?: { receipt_id: string }; // Return minimal receipt info
    pdfPath?: string; // Path on the server (for potential internal use)
    pdfError?: string; // Specific PDF generation error message
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
    const funcPrefix = `${ACTION_LOG_PREFIX}:createReceipt:${operationId}`;
    logger.info(funcPrefix, 'Starting createReceipt action execution.', data);

    try {
        // 1. Fetch required data concurrently
        logger.debug(funcPrefix, 'Fetching products, seller profile, and customer data concurrently.');
        const [products, sellerProfile, customer] = await Promise.all([
            getAllProducts(),
            getSellerProfile(),
            getCustomerById(data.customer_id),
        ]);
        logger.debug(funcPrefix, `Fetched ${products.length} products, seller profile ${sellerProfile ? 'found' : 'not found'}, customer ${customer ? 'found' : 'not found'}.`);

        // 2. Validate fetched data
        if (!products || products.length === 0) {
            logger.warn(funcPrefix, 'Validation failed: No products found in data access.');
            return { success: false, message: 'Cannot create invoice: No products defined in the system.' };
        }
        if (!sellerProfile) {
            logger.warn(funcPrefix, 'Validation failed: Seller profile not found.');
            return { success: false, message: 'Cannot create invoice: Seller profile is not configured.' };
        }
        if (!customer) {
            logger.warn(funcPrefix, `Validation failed: Customer not found for ID: ${data.customer_id}`);
            return { success: false, message: `Cannot create invoice: Customer with ID ${data.customer_id} not found.` };
        }

        // 3. Process Line Items and Calculate Totals
        logger.debug(funcPrefix, 'Processing line items and calculating totals.');
        const lineItems: LineItem[] = [];
        let subtotalExclGST = 0;
        let GSTAmount = 0;

        for (const item of data.line_items) {
            const product = products.find((p) => p.id === item.product_id);
            if (!product) {
                logger.error(funcPrefix, `Data inconsistency: Product with ID ${item.product_id} from input not found in fetched products.`);
                throw new Error(`Product with ID ${item.product_id} not found. Data might be outdated.`); // Throw to indicate critical failure
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

        // Ensure GST is zero if not included globally
        if (!data.include_gst) {
            GSTAmount = 0;
        }

        // Round totals to 2 decimal places *after* all calculations
        subtotalExclGST = parseFloat(subtotalExclGST.toFixed(2));
        GSTAmount = parseFloat(GSTAmount.toFixed(2));
        const totalIncGST = parseFloat((subtotalExclGST + GSTAmount).toFixed(2));

        // Determine if it qualifies as a Tax Invoice (Can be more complex based on AU law, this is simplified)
        const isTaxInvoice = data.force_tax_invoice || (data.include_gst && totalIncGST >= 82.50);
        logger.debug(funcPrefix, `Calculated Totals: Subtotal=${subtotalExclGST}, GST=${GSTAmount}, Total=${totalIncGST}, IsTaxInvoice=${isTaxInvoice}`);

        // 4. Create Receipt Object
        const newReceipt: Receipt = {
            receipt_id: uuidv4(),
            customer_id: data.customer_id,
            date_of_purchase: data.date_of_purchase, // Store as ISO string (or YYYY-MM-DD)
            line_items: lineItems,
            subtotal_excl_GST: subtotalExclGST,
            GST_amount: GSTAmount,
            total_inc_GST: totalIncGST,
            is_tax_invoice: isTaxInvoice,
            seller_profile_snapshot: sellerProfile, // Snapshot seller details
            customer_snapshot: { // Snapshot relevant customer details
                // Include all fields from Customer type, ensuring type safety
                id: customer.id, // Include id here for completeness, though redundant
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

        // 5. Save Receipt Data
        logger.debug(funcPrefix, `Attempting to save receipt data for ID: ${newReceipt.receipt_id}`);
        const createdReceipt = await createReceiptData(newReceipt);
        if (!createdReceipt) {
            logger.error(funcPrefix, 'Data access layer failed to save the receipt.');
            // Note: PDF is not generated if saving fails
            return { success: false, message: 'Failed to save invoice data.' };
        }
        logger.info(funcPrefix, `Receipt data saved successfully for ID: ${newReceipt.receipt_id}`);

        // 6. Generate PDF (async, but wait for result here)
        logger.info(funcPrefix, `Initiating PDF generation for receipt ID: ${newReceipt.receipt_id}`);
        const pdfGenerator = new PdfGenerator();
        const pdfResult = await pdfGenerator.generate(newReceipt, operationId); // Pass the full receipt and operation ID

        if (pdfResult.success) {
            logger.info(funcPrefix, `PDF generated successfully. Path: ${pdfResult.filePath}`);
            return {
                success: true,
                receipt: { receipt_id: newReceipt.receipt_id },
                pdfPath: pdfResult.filePath, // Include server path if needed internally
            };
        } else {
            // PDF generation failed, but receipt data *was* saved.
            logger.error(funcPrefix, `PDF generation failed for receipt ID: ${newReceipt.receipt_id}. Reason: ${pdfResult.message}`);
            return {
                success: true, // Data was saved, so action partially succeeded
                receipt: { receipt_id: newReceipt.receipt_id },
                pdfError: pdfResult.message || 'Unknown PDF generation error.', // Return specific PDF error
            };
        }

    } catch (error) {
        logger.error(funcPrefix, 'An unexpected error occurred during invoice creation', error);
        return {
            success: false,
            message: `An unexpected error occurred during invoice creation: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

export async function getAllReceipts(): Promise<Receipt[]> {
    const funcPrefix = `${ACTION_LOG_PREFIX}:getAllReceipts`;
    logger.debug(funcPrefix, 'Executing getAllReceipts server action.');
    try {
        const receipts = await getAllReceiptsData();
        logger.info(funcPrefix, `Retrieved ${receipts.length} receipts.`);
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
