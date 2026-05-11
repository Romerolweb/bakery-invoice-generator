import type { Receipt, LineItem } from "@/lib/types";
import { logger } from "@/lib/services/logging";
import { db } from "@/lib/db";
import { receipts, receiptItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

const DATA_ACCESS_LOG_PREFIX = "ReceiptDataAccess";
const RECEIPT_ID_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidReceiptId(receiptId: string): boolean {
  return RECEIPT_ID_UUID_REGEX.test(receiptId);
}

// Helper to map DB result to Receipt interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbReceiptToInterface(dbReceipt: any): Receipt {
  // Destructure to remove the raw relation property 'lineItems' from the result
  // and map it to 'line_items' as expected by the interface
  const { lineItems, ...rest } = dbReceipt;
  return {
    ...rest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    line_items: lineItems.map((item: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, receipt_id, ...itemRest } = item;
      return itemRest as LineItem;
    }),
  };
}

export async function getReceiptPdfPath(receiptId: string): Promise<string | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptPdfPath:${receiptId}`;
  if (!isValidReceiptId(receiptId)) {
    await logger.warn(funcPrefix, "Invalid receipt ID format.");
    return null;
  }

  const receiptsDir = path.resolve(process.cwd(), "src", "lib", "data", "receipts");
  const filePath = path.resolve(receiptsDir, `${receiptId}.pdf`);

  const relativePath = path.relative(receiptsDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    await logger.warn(funcPrefix, "Blocked invalid receipt PDF path.");
    return null;
  }

  try {
    await fs.access(filePath);
  } catch {
    await logger.warn(funcPrefix, "Receipt PDF file not found.");
    return null;
  }

  return filePath;
}

export async function getReceiptPdfContent(
  receiptId: string,
): Promise<Buffer | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptPdfContent:${receiptId}`;
  const receiptPdfPath = await getReceiptPdfPath(receiptId);
  if (!receiptPdfPath) {
    return null;
  }

  try {
    return await fs.readFile(receiptPdfPath);
  } catch (error) {
    await logger.error(
      funcPrefix,
      "Error reading receipt PDF content",
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

export async function getAllReceipts(): Promise<Receipt[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getAllReceipts`;
  await logger.debug(funcPrefix, "Attempting to get all receipts.");
  try {
    const result = await db.query.receipts.findMany({
      with: {
        lineItems: true,
      },
    });

    return result.map(mapDbReceiptToInterface);
  } catch (error) {
    await logger.error(
      funcPrefix,
      "Error retrieving all receipts",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptById:${id}`;
  await logger.debug(funcPrefix, "Attempting to get receipt by ID.");
  try {
    const result = await db.query.receipts.findFirst({
      where: eq(receipts.receipt_id, id),
      with: {
        lineItems: true,
      },
    });

    if (result) {
      await logger.debug(funcPrefix, "Receipt found.");
      return mapDbReceiptToInterface(result);
    } else {
      await logger.debug(funcPrefix, "Receipt not found.");
      return null;
    }
  } catch (error) {
    await logger.error(
      funcPrefix,
      "Error retrieving receipt by ID",
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

export async function createReceipt(
  newReceipt: Receipt,
): Promise<Receipt | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:createReceipt`;
  await logger.debug(
    funcPrefix,
    `Attempting to create receipt with ID: ${newReceipt.receipt_id}`,
  );
  try {
    // Check if receipt exists
    const existing = await db
      .select()
      .from(receipts)
      .where(eq(receipts.receipt_id, newReceipt.receipt_id));
    if (existing.length > 0) {
      await logger.warn(
        funcPrefix,
        `Receipt with ID ${newReceipt.receipt_id} already exists. Creation aborted.`,
      );
      return null;
    }

    // Transaction to insert receipt and line items
    await db.transaction(async (tx) => {
      // Insert receipt
      // Extract line_items to separate variable
      const { line_items, ...receiptData } = newReceipt;

      await tx.insert(receipts).values(receiptData);

      // Insert line items
      if (line_items && line_items.length > 0) {
        const itemsToInsert = line_items.map((item) => ({
          ...item,
          receipt_id: newReceipt.receipt_id,
        }));
        await tx.insert(receiptItems).values(itemsToInsert);
      }
    });

    await logger.info(
      funcPrefix,
      `Receipt created successfully: ${newReceipt.receipt_id}`,
    );
    return newReceipt;
  } catch (error) {
    await logger.error(
      funcPrefix,
      "Error creating new receipt",
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}
