// src/lib/actions/receipts.ts
"use server";

import {
  Receipt,
  LineItem,
} from "@/lib/types";
import {
  createReceipt as createReceiptData,
  getAllReceipts as getAllReceiptsData,
  getReceiptById as getReceiptByIdData,
} from "@/lib/data-access/receipts";
import { getAllProducts } from "@/lib/data-access/products";
import { getSellerProfile } from "@/lib/data-access/seller";
import { getCustomerById } from "@/lib/data-access/customers";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/services/logging";
import { recordChange } from "@/lib/recordChanges";

const ACTION_LOG_PREFIX = "ReceiptActions";

// PDF generation has been replaced with web-based receipt viewing

// Result structure for the action
interface CreateReceiptResult {
  success: boolean; // Overall success (including data saving)
  message?: string; // General message or data saving error message
  receipt?: { receipt_id: string }; // Return minimal receipt info if data saved
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

export async function createReceipt(
  data: CreateReceiptParams,
): Promise<CreateReceiptResult> {
  const operationId = uuidv4().substring(0, 8); // Unique ID for this operation flow
  const funcPrefix = `${ACTION_LOG_PREFIX}:createReceipt:${operationId}`;
  let newReceipt: Receipt | null = null;

  await logger.info(funcPrefix, "Starting createReceipt action execution.", {
    customerId: data.customer_id,
    date: data.date_of_purchase,
    itemCount: data.line_items.length,
  });
  recordChange(
    "src/lib/actions/receipts.ts",
    `Starting createReceipt for customer ${data.customer_id}`,
  );

  try {
    // --- Step 1: Fetch required data ---
    await logger.debug(
      funcPrefix,
      "Fetching products, seller profile, and customer data concurrently.",
    );
    const [products, sellerProfile, customer] = await Promise.all([
      getAllProducts(),
      getSellerProfile(),
      getCustomerById(data.customer_id),
    ]);
    await logger.debug(
      funcPrefix,
      `Fetched ${products.length} products, seller profile ${sellerProfile ? "found" : "not found"}, customer ${customer ? "found" : "not found"}.`,
    );
    recordChange(
      "src/lib/actions/receipts.ts",
      `Fetched ${products.length} products, seller profile ${sellerProfile ? "found" : "not found"}, customer ${customer ? "found" : "not found"}`,
    );

    // --- Step 2: Validate fetched data ---
    if (!products || products.length === 0) {
      await logger.warn(
        funcPrefix,
        "Validation failed: No products found in data access.",
      );
      recordChange(
        "src/lib/actions/receipts.ts",
        "Validation failed: No products found.",
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
      recordChange(
        "src/lib/actions/receipts.ts",
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
        `Validation failed: Customer not found for ID: ${data.customer_id}`,
      );
      recordChange(
        "src/lib/actions/receipts.ts",
        `Validation failed: Customer ${data.customer_id} not found.`,
      );
      return {
        success: false,
        message: `Cannot create invoice: Customer with ID ${data.customer_id} not found.`,
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

    for (const item of data.line_items) {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) {
        await logger.error(
          funcPrefix,
          `Data inconsistency: Product with ID ${item.product_id} from input not found in fetched products.`,
        );
        recordChange(
          "src/lib/actions/receipts.ts",
          `Validation failed: Product ${item.product_id} not found.`,
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
      if (data.include_gst && product.GST_applicable) {
        GSTAmount += lineTotal * 0.1;
      }
    }

    if (!data.include_gst) {
      GSTAmount = 0;
    }

    subtotalExclGST = parseFloat(subtotalExclGST.toFixed(2));
    GSTAmount = parseFloat(GSTAmount.toFixed(2));
    const totalIncGST = parseFloat((subtotalExclGST + GSTAmount).toFixed(2));

    const isTaxInvoice =
      data.force_tax_invoice || (data.include_gst && totalIncGST >= 82.5);
    await logger.debug(
      funcPrefix,
      `Calculated Totals: Subtotal=${subtotalExclGST}, GST=${GSTAmount}, Total=${totalIncGST}, IsTaxInvoice=${isTaxInvoice}`,
    );
    recordChange(
      "src/lib/actions/receipts.ts",
      `Calculated totals: Sub=${subtotalExclGST}, GST=${GSTAmount}, Total=${totalIncGST}`,
    );

    // --- Step 4: Create Receipt Object ---
    newReceipt = {
      receipt_id: uuidv4(),
      customer_id: data.customer_id,
      date_of_purchase: data.date_of_purchase,
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
    recordChange(
      "src/lib/actions/receipts.ts",
      `Created receipt object ${newReceipt.receipt_id}`,
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
      recordChange(
        "src/lib/actions/receipts.ts",
        `Failed to save receipt data ${newReceipt.receipt_id}`
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
    recordChange(
      "src/lib/actions/receipts.ts",
      `Saved receipt data ${newReceipt.receipt_id}`
    );

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
      error instanceof Error ? error : new Error(String(error))
    );
    recordChange(
      "src/lib/actions/receipts.ts",
      `Unexpected error during invoice creation: ${errorMessage}`,
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
    recordChange(
      "src/lib/actions/receipts.ts",
      `Retrieved ${receipts.length} receipts.`,
    );
    return receipts;
  } catch (error) {
    await logger.error(funcPrefix, "Error getting all receipts", error instanceof Error ? error : new Error(String(error)));
    recordChange(
      "src/lib/actions/receipts.ts",
      `Error retrieving receipts: ${error instanceof Error ? error.message : "Unknown"}`,
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
      recordChange(
        "src/lib/actions/receipts.ts",
        `Retrieved receipt ${id}.`
      );
    } else {
      await logger.warn(funcPrefix, `Receipt with ID ${id} not found.`);
      recordChange(
        "src/lib/actions/receipts.ts",
        `Receipt ${id} not found.`
      );
    }
    return receipt;
  } catch (error) {
    await logger.error(funcPrefix, `Error getting receipt by ID ${id}`, error instanceof Error ? error : new Error(String(error)));
    recordChange(
      "src/lib/actions/receipts.ts",
      `Error retrieving receipt ${id}: ${error instanceof Error ? error.message : "Unknown"}`
    );
    return null;
  }
}
