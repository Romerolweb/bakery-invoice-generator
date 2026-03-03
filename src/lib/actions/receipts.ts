// src/lib/actions/receipts.ts
"use server";

import { Receipt, LineItem } from "@/lib/types";
import {
  createReceipt as createReceiptData,
  getAllReceipts as getAllReceiptsData,
  getReceiptById as getReceiptByIdData,
} from "@/lib/data-access/receipts";
import { getAllProducts } from "@/lib/data-access/products";
import { getSellerProfile } from "@/lib/data-access/seller";
import { getCustomerById } from "@/lib/data-access/customers";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { logger } from "@/lib/services/logging";
import { revalidatePath } from "next/cache";

const ACTION_LOG_PREFIX = "ReceiptActions";

// PDF generation has been replaced with web-based receipt viewing

// Result structure for the action
interface CreateReceiptResult {
  success: boolean; // Overall success (including data saving)
  message?: string; // General message or data saving error message
  receipt?: { receipt_id: string }; // Return minimal receipt info if data saved
  errors?: Record<string, string[]>; // For validation errors
}

// --- Schemas for Validation ---
const submissionLineItemSchema = z.object({
  product_id: z.string().uuid("Invalid product ID format"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

const createReceiptSchema = z.object({
  customer_id: z.string().uuid("Invalid customer ID format"),
  date_of_purchase: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  line_items: z
    .array(submissionLineItemSchema)
    .min(1, "At least one line item is required"),
  include_gst: z.boolean(),
  force_tax_invoice: z.boolean(),
});

// Input parameters for the action
type SubmissionLineItem = z.infer<typeof submissionLineItemSchema>;
type CreateReceiptParams = z.infer<typeof createReceiptSchema>;

export async function createReceipt(
  data: CreateReceiptParams,
): Promise<CreateReceiptResult> {
  const operationId = uuidv4().substring(0, 8); // Unique ID for this operation flow
  const funcPrefix = `${ACTION_LOG_PREFIX}:createReceipt:${operationId}`;
  let newReceipt: Receipt | null = null;

  // --- Step 0: Server-side validation ---
  const validationResult = createReceiptSchema.safeParse(data);
  if (!validationResult.success) {
    const errors = validationResult.error.flatten().fieldErrors;
    await logger.warn(funcPrefix, "Validation failed.", errors);
    return {
      success: false,
      message: "Validation failed. Please check the fields.",
      errors,
    };
  }

  // Use validated data
  const validatedData = validationResult.data;

  await logger.info(funcPrefix, "Starting createReceipt action execution.", {
    customerId: validatedData.customer_id,
    date: validatedData.date_of_purchase,
    itemCount: validatedData.line_items.length,
  });

  try {
    // --- Step 1: Fetch required data ---
    await logger.debug(
      funcPrefix,
      "Fetching products, seller profile, and customer data concurrently.",
    );
    const [products, sellerProfile, customer] = await Promise.all([
      getAllProducts(),
      getSellerProfile(),
      getCustomerById(validatedData.customer_id),
    ]);
    await logger.debug(
      funcPrefix,
      `Fetched ${products.length} products, seller profile ${sellerProfile ? "found" : "not found"}, customer ${customer ? "found" : "not found"}.`,
    );

    // --- Step 2: Validate fetched data ---
    if (!products || products.length === 0) {
      await logger.warn(
        funcPrefix,
        "Validation failed: No products found in data access.",
      );
      return {
        success: false,
        message: "Cannot create invoice: No products defined in the system.",
      };
    }
    if (!sellerProfile) {
      await logger.warn(
        funcPrefix,
        "Validation failed: Seller profile not found.",
      );
      return {
        success: false,
        message: "Cannot create invoice: Seller profile is not configured.",
      };
    }
    if (!customer) {
      await logger.warn(
        funcPrefix,
        `Validation failed: Customer not found for ID: ${validatedData.customer_id}`,
      );
      return {
        success: false,
        message: `Cannot create invoice: Customer with ID ${validatedData.customer_id} not found.`,
      };
    }

    // --- Step 3: Process Line Items and Calculate Totals ---
    await logger.debug(
      funcPrefix,
      "Processing line items and calculating totals.",
    );
    const lineItems: LineItem[] = [];
    let subtotalExclGST = 0;
    let GSTAmount = 0;

    for (const item of validatedData.line_items) {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) {
        await logger.error(
          funcPrefix,
          `Data inconsistency: Product with ID ${item.product_id} from input not found in fetched products.`,
        );
        return {
          success: false,
          message: `Product with ID ${item.product_id} not found. Please refresh products and try again.`,
        };
      }
      const lineTotal = product.unit_price * item.quantity;
      lineItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: product.unit_price,
        line_total: lineTotal,
        product_name: product.name,
        description: product.description || "",
        GST_applicable: product.GST_applicable,
      });

      subtotalExclGST += lineTotal;
      if (validatedData.include_gst && product.GST_applicable) {
        GSTAmount += lineTotal * 0.1;
      }
    }

    if (!validatedData.include_gst) {
      GSTAmount = 0;
    }

    subtotalExclGST = parseFloat(subtotalExclGST.toFixed(2));
    GSTAmount = parseFloat(GSTAmount.toFixed(2));
    const totalIncGST = parseFloat((subtotalExclGST + GSTAmount).toFixed(2));

    const isTaxInvoice =
      validatedData.force_tax_invoice ||
      (validatedData.include_gst && totalIncGST >= 82.5);
    await logger.debug(
      funcPrefix,
      `Calculated Totals: Subtotal=${subtotalExclGST}, GST=${GSTAmount}, Total=${totalIncGST}, IsTaxInvoice=${isTaxInvoice}`,
    );

    // --- Step 4: Create Receipt Object ---
    newReceipt = {
      receipt_id: uuidv4(),
      customer_id: validatedData.customer_id,
      date_of_purchase: validatedData.date_of_purchase,
      line_items: lineItems,
      subtotal_excl_GST: subtotalExclGST,
      GST_amount: GSTAmount,
      total_inc_GST: totalIncGST,
      is_tax_invoice: isTaxInvoice,
      seller_profile_snapshot: sellerProfile,
      customer_snapshot: customer, // Store the full customer object as snapshot
    };
    await logger.debug(
      funcPrefix,
      `Constructed new receipt object with ID: ${newReceipt.receipt_id}`,
    );

    // --- Step 5: Save Receipt Data ---
    await logger.debug(
      funcPrefix,
      `Attempting to save receipt data for ID: ${newReceipt.receipt_id}`,
    );
    const createdReceiptData = await createReceiptData(newReceipt);
    if (!createdReceiptData) {
      await logger.error(
        funcPrefix,
        "Data access layer failed to save the receipt.",
      );
      return {
        success: false,
        message: "Failed to save invoice data.",
      };
    }
    await logger.info(
      funcPrefix,
      `Receipt data saved successfully for ID: ${newReceipt.receipt_id}`,
    );

    // Revalidate pages that display receipts
    revalidatePath("/receipts");
    revalidatePath(`/receipt/${newReceipt.receipt_id}`);
    revalidatePath(`/receipt-view/${newReceipt.receipt_id}`);

    // Return success result with the created receipt
    return {
      success: true,
      receipt: { receipt_id: newReceipt.receipt_id },
    };
  } catch (error) {
    // Catch errors from Steps 1-5
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during invoice creation process.";
    await logger.error(
      funcPrefix,
      "An unexpected error occurred during invoice creation",
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      success: false,
      message: `An unexpected error occurred during invoice creation: ${errorMessage}`,
    };
  }
}

export async function getAllReceipts(): Promise<Receipt[]> {
  const funcPrefix = `${ACTION_LOG_PREFIX}:getAllReceipts`;
  await logger.debug(funcPrefix, "Executing getAllReceipts server action.");
  try {
    const receipts = await getAllReceiptsData();
    receipts.sort(
      (a, b) =>
        new Date(b.date_of_purchase).getTime() -
        new Date(a.date_of_purchase).getTime(),
    );
    await logger.info(
      funcPrefix,
      `Retrieved and sorted ${receipts.length} receipts.`,
    );
    return receipts;
  } catch (error) {
    await logger.error(
      funcPrefix,
      "Error getting all receipts",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
  const funcPrefix = `${ACTION_LOG_PREFIX}:getReceiptById:${id}`;
  await logger.debug(funcPrefix, "Executing getReceiptById server action.");
  try {
    const receipt = await getReceiptByIdData(id);
    if (receipt) {
      await logger.info(funcPrefix, `Receipt with ID ${id} found.`);
    } else {
      await logger.warn(funcPrefix, `Receipt with ID ${id} not found.`);
    }
    return receipt;
  } catch (error) {
    await logger.error(
      funcPrefix,
      `Error getting receipt by ID ${id}`,
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}
