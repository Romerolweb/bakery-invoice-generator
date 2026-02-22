import fs from "fs/promises";
import path from "path";
import type { Receipt, LineItem } from "@/lib/types";
import { logger } from "@/lib/services/logging";
import { db } from "@/lib/db";
import { receipts, receiptItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DATA_ACCESS_LOG_PREFIX = "ReceiptDataAccess";
const dataDirectory = path.join(process.cwd(), "src", "lib", "data");
const pdfDirectory = path.join(dataDirectory, "receipt-pdfs");

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
    await logger.error(funcPrefix, "Error retrieving all receipts",
      error instanceof Error ? error : new Error(String(error)));
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
    await logger.error(funcPrefix, "Error retrieving receipt by ID",
      error instanceof Error ? error : new Error(String(error)));
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
    const existing = await db.select().from(receipts).where(eq(receipts.receipt_id, newReceipt.receipt_id));
    if (existing.length > 0) {
      await logger.warn(
        funcPrefix,
        `Receipt with ID ${newReceipt.receipt_id} already exists. Creation aborted.`,
      );
      return null;
    }

    // Transaction to insert receipt and line items (Sync for better-sqlite3)
    db.transaction((tx) => {
      // Insert receipt
      // Extract line_items to separate variable
      const { line_items, ...receiptData } = newReceipt;

      tx.insert(receipts).values(receiptData).run();

      // Insert line items
      if (line_items && line_items.length > 0) {
        const itemsToInsert = line_items.map(item => ({
          ...item,
          receipt_id: newReceipt.receipt_id
        }));
        tx.insert(receiptItems).values(itemsToInsert).run();
      }
    });

    await logger.info(
      funcPrefix,
      `Receipt created successfully: ${newReceipt.receipt_id}`,
    );
    return newReceipt;
  } catch (error) {
    await logger.error(funcPrefix, "Error creating new receipt",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function getReceiptPdfPath(
  receiptId: string,
): Promise<string | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptPdfPath:${receiptId}`;
  const filePath = path.join(pdfDirectory, `${receiptId}.pdf`);
  await logger.debug(funcPrefix, `Checking for PDF file at path: ${filePath}`);
  try {
    await fs.mkdir(pdfDirectory, { recursive: true });
    await fs.access(filePath, fs.constants.F_OK);
    await logger.info(funcPrefix, `PDF found at path: ${filePath}`);
    return filePath;
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
      await logger.info(
        funcPrefix,
        `PDF file not found at ${filePath}. It might be generating or failed.`,
      );
    } else {
      await logger.error(
        funcPrefix,
        `Error accessing PDF file at ${filePath}`,
        error as Error,
      );
    }
    return null;
  }
}

export async function getReceiptPdfContent(
  receiptId: string,
): Promise<Buffer | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptPdfContent:${receiptId}`;
  const filePath = path.join(pdfDirectory, `${receiptId}.pdf`);
  await logger.debug(
    funcPrefix,
    `Attempting to read PDF content from: ${filePath}`,
  );
  try {
    const existingPath = await getReceiptPdfPath(receiptId);
    if (!existingPath) {
      return null;
    }
    const pdfBuffer = await fs.readFile(filePath);
    await logger.info(
      funcPrefix,
      `Successfully read PDF content (${pdfBuffer.length} bytes).`,
    );
    return pdfBuffer;
  } catch (error: unknown) {
    await logger.error(
      funcPrefix,
      `Error reading PDF file content at ${filePath}`,
      error as Error,
    );
    return null;
  }
}
