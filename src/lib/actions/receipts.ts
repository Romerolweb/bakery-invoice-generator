'use server';

import type { Receipt, LineItem, Customer, Product, SellerProfile } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getCustomerById } from './customers'; // Assuming customer actions exist
import { getProductById } from './products'; // Assuming product actions exist
import { getSellerProfile } from './seller'; // Assuming seller actions exist
import { format } from 'date-fns'; // For date formatting

const DATA_DIR = path.join(process.cwd(), 'src/lib/data');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs

// Ensure necessary directories exist
async function ensureDirectoriesExist() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(PDF_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating data/PDF directories:', error);
    }
}
ensureDirectoriesExist();


// --- Data Handling ---

// Helper function to read receipts data
async function readReceipts(): Promise<Receipt[]> {
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
async function writeReceipts(receipts: Receipt[]): Promise<void> {
  try {
    await fs.writeFile(RECEIPTS_FILE, JSON.stringify(receipts, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing receipts:', error);
    throw new Error('Failed to save receipts.');
  }
}

// --- Core Receipt Logic ---

interface CreateReceiptInput {
  customer_id: string;
  date_of_purchase?: string; // Optional, defaults to today
  line_items: Array<{ product_id: string; quantity: number }>;
  include_gst: boolean; // Explicit flag from UI
  force_tax_invoice?: boolean; // Optional flag if user requests tax invoice explicitly
}

export async function createReceipt(
    input: CreateReceiptInput
): Promise<{ success: boolean; message?: string; receipt?: Receipt; pdfPath?: string }> {

    // 1. Validation
    if (!input.customer_id || !input.line_items || input.line_items.length === 0) {
        return { success: false, message: 'Customer and at least one line item are required.' };
    }
    if (input.line_items.some(item => !item.product_id || item.quantity == null || item.quantity <= 0)) {
       return { success: false, message: 'Each line item must have a valid product ID and a quantity greater than 0.' };
    }


    try {
        // 2. Fetch Data
        const customer = await getCustomerById(input.customer_id);
        if (!customer) {
            return { success: false, message: `Customer with ID ${input.customer_id} not found.` };
        }

        const sellerProfile = await getSellerProfile(); // Get current seller profile

        const products: (Product | null)[] = await Promise.all(
            input.line_items.map(item => getProductById(item.product_id))
        );

        if (products.some(p => p === null)) {
            const missingIds = input.line_items
                .filter((_, index) => products[index] === null)
                .map(item => item.product_id);
            return { success: false, message: `Product(s) not found: ${missingIds.join(', ')}.` };
        }

        const validProducts = products as Product[]; // Type assertion after check

        // 3. Calculations
        let subtotal_excl_GST = 0;
        let total_gst_amount = 0;
        const calculatedLineItems: LineItem[] = [];

        input.line_items.forEach((item, index) => {
            const product = validProducts[index];
            const lineTotal = product.unit_price * item.quantity;
            subtotal_excl_GST += lineTotal;

            calculatedLineItems.push({
                product_id: product.id,
                quantity: item.quantity,
                unit_price: product.unit_price,
                line_total: lineTotal,
                product_name: product.name, // Add name for display
            });

            // Calculate GST only if global flag is true AND product is GST applicable
            if (input.include_gst && product.GST_applicable) {
                 // GST is calculated on the *price including GST*.
                 // Price stated is typically GST-inclusive if applicable.
                 // To get GST amount: Price / 11
                 // To get Excl GST price: Price / 1.1
                 // Let's assume unit_price is GST-INCLUSIVE if GST_applicable is true.
                 // Recalculate logic assuming unit_price might be exclusive or inclusive.
                 // *Correction*: Assuming unit_price in the product data is ALWAYS exclusive of GST.
                 const lineGst = lineTotal * 0.1;
                 total_gst_amount += lineGst;
            }
        });

        // Adjust subtotal if prices were meant to be GST inclusive
        // *If unit_price WAS inclusive:*
        // let corrected_subtotal_excl_GST = 0;
        // calculatedLineItems.forEach(item => {
        //     const product = validProducts.find(p => p.id === item.product_id)!;
        //     if(product.GST_applicable && input.include_gst) {
        //         corrected_subtotal_excl_GST += item.line_total! / 1.1;
        //     } else {
        //         corrected_subtotal_excl_GST += item.line_total!;
        //     }
        // });
        // subtotal_excl_GST = corrected_subtotal_excl_GST;
        // if(input.include_gst) { // Recalc GST based on corrected exclusive subtotal
        //    total_gst_amount = subtotal_excl_GST * 0.1;
        // } else {
        //     total_gst_amount = 0;
        // }

        // If input.include_gst is false, GST amount must be 0
        if (!input.include_gst) {
            total_gst_amount = 0;
        }

        const total_inc_GST = subtotal_excl_GST + total_gst_amount;

        // 4. Determine Tax Invoice Status
        // Threshold is $82.50 *inclusive* of GST
        const isTaxInvoiceRequired = (input.include_gst && total_inc_GST >= 82.50) || input.force_tax_invoice;

        // 5. Create Receipt Object
        const purchaseDate = input.date_of_purchase ? new Date(input.date_of_purchase) : new Date();
        const newReceipt: Receipt = {
            receipt_id: uuidv4(),
            customer_id: input.customer_id,
            date_of_purchase: purchaseDate.toISOString(), // Store as ISO string
            line_items: calculatedLineItems,
            subtotal_excl_GST: parseFloat(subtotal_excl_GST.toFixed(2)), // Round to 2 decimal places
            GST_amount: parseFloat(total_gst_amount.toFixed(2)),
            total_inc_GST: parseFloat(total_inc_GST.toFixed(2)),
            is_tax_invoice: isTaxInvoiceRequired,
            seller_profile_snapshot: sellerProfile, // Snapshot seller details
            customer_snapshot: { // Snapshot customer details
                first_name: customer.first_name,
                last_name: customer.last_name,
                email: customer.email,
                phone: customer.phone,
                address: customer.address,
            }
        };

        // 6. Generate PDF (Placeholder - implement actual PDF generation here)
        const pdfPath = path.join(PDF_DIR, `${newReceipt.receipt_id}.pdf`);
        const pdfGenerationResult = await generatePdfStub(newReceipt, pdfPath); // Replace with actual PDF generation

        if (!pdfGenerationResult.success) {
             return { success: false, message: pdfGenerationResult.message || "Failed to generate PDF." };
        }


        // 7. Save Receipt Data
        const allReceipts = await readReceipts();
        allReceipts.unshift(newReceipt); // Add to the beginning (most recent first)
        await writeReceipts(allReceipts);


        return { success: true, receipt: newReceipt, pdfPath: pdfPath };

    } catch (error: any) {
        console.error("Error creating receipt:", error);
        return { success: false, message: error.message || 'An unexpected error occurred during receipt creation.' };
    }
}

// --- Retrieval ---

export async function getReceipts(): Promise<Receipt[]> {
  return await readReceipts();
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
    const receipts = await readReceipts();
    const receipt = receipts.find(r => r.receipt_id === id);
    return receipt || null;
}

// --- PDF Generation (Stub - Replace with actual implementation) ---
async function generatePdfStub(receipt: Receipt, filePath: string): Promise<{ success: boolean; message?: string }> {
     console.log(`--- Generating PDF Stub for Receipt ID: ${receipt.receipt_id} ---`);
     console.log("Seller:", receipt.seller_profile_snapshot.name);
     console.log("Customer:", receipt.customer_snapshot.first_name, receipt.customer_snapshot.last_name);
     console.log("Date:", format(new Date(receipt.date_of_purchase), 'dd/MM/yyyy'));
     console.log("Items:");
     receipt.line_items.forEach(item => {
         console.log(`  ${item.quantity}x ${item.product_name} @ $${item.unit_price?.toFixed(2)} = $${item.line_total?.toFixed(2)}`);
     });
     console.log("Subtotal (ex GST):", `$${receipt.subtotal_excl_GST.toFixed(2)}`);
     console.log("GST Amount:", `$${receipt.GST_amount.toFixed(2)}`);
     console.log("Total (inc GST):", `$${receipt.total_inc_GST.toFixed(2)}`);
     console.log("Is Tax Invoice:", receipt.is_tax_invoice);
     console.log(`--- PDF would be saved to: ${filePath} ---`);

    // Simulate saving a dummy file
     try {
        await fs.writeFile(filePath, `Dummy PDF content for receipt ${receipt.receipt_id}`);
        return { success: true };
     } catch (error: any) {
        console.error("Error writing dummy PDF stub:", error);
        return { success: false, message: `Failed to write dummy PDF: ${error.message}` };
     }
}

// --- PDF Retrieval (Action to get the path or content) ---
export async function getReceiptPdfPath(receiptId: string): Promise<string | null> {
    const receipt = await getReceiptById(receiptId);
    if (!receipt) return null;

    const pdfPath = path.join(PDF_DIR, `${receipt.receipt_id}.pdf`);
    try {
        // Check if the file actually exists
        await fs.access(pdfPath);
        return pdfPath;
    } catch (error) {
        console.error(`PDF file not found for receipt ${receiptId} at ${pdfPath}`);
        return null; // Or potentially regenerate the PDF if logic allows
    }
}

// Optional: Action to read PDF content (e.g., for direct download)
export async function getReceiptPdfContent(receiptId: string): Promise<Buffer | null> {
     const pdfPath = await getReceiptPdfPath(receiptId);
     if (!pdfPath) return null;

     try {
         const pdfContent = await fs.readFile(pdfPath);
         return pdfContent;
     } catch (error) {
         console.error(`Error reading PDF content for receipt ${receiptId}:`, error);
         return null;
     }
}
