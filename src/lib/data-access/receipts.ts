// src/lib/data-access/receipts.ts
import fs from "fs/promises"; // Use fs/promises
import path from "path";
import type { Receipt } from "@/lib/types";
import { logger } from "@/lib/services/logging";

const DATA_ACCESS_LOG_PREFIX = "ReceiptDataAccess";
const dataDirectory = path.join(process.cwd(), "src", "lib", "data");
const receiptsFilePath = path.join(dataDirectory, "receipts.json");
const pdfDirectory = path.join(dataDirectory, "receipt-pdfs"); // Define PDF directory path

// Reads the receipts data file
async function readReceiptsFile(): Promise<Receipt[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:readReceiptsFile`;
  try {
    // Ensure the directory exists before reading
    await fs.mkdir(dataDirectory, { recursive: true });
    await logger.debug(
      funcPrefix,
      `Ensured data directory exists: ${dataDirectory}`,
    );

    const data = await fs.readFile(receiptsFilePath, "utf8");
    await logger.debug(
      funcPrefix,
      `Successfully read receipts file: ${receiptsFilePath}`,
    );
    return JSON.parse(data) as Receipt[];
  } catch (error: unknown) { // Changed from any to unknown
    // Type guard for ENOENT error
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === "ENOENT") {
      await logger.warn(
        funcPrefix,
        `Receipts file not found at ${receiptsFilePath}, returning empty array.`,
      );
      return []; // File doesn't exist, return empty array
    }
    await logger.error(
      funcPrefix,
      `Error reading receipts file: ${receiptsFilePath}`,
      error instanceof Error ? error : new Error(String(error)) // Ensure Error object for logger
    );
    // Check if error is an instance of Error to access message property
    if (error instanceof Error) {
      throw new Error(`Failed to read receipts data: ${error.message}`);
    }
    throw new Error(`Failed to read receipts data: Unexpected error occurred.`); // Fallback
  }
}

// Writes the receipts data file
async function writeReceiptsFile(receipts: Receipt[]): Promise<void> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:writeReceiptsFile`;
  try {
    // Ensure the directory exists before writing
    await fs.mkdir(dataDirectory, { recursive: true });
    await logger.debug(
      funcPrefix,
      `Ensured data directory exists: ${dataDirectory}`,
    );

    await fs.writeFile(receiptsFilePath, JSON.stringify(receipts, null, 2));
    await logger.debug(
      funcPrefix,
      `Successfully wrote receipts file: ${receiptsFilePath}`,
    );
  } catch (error: unknown) { // Changed from any to unknown
    await logger.error(
      funcPrefix,
      `Error writing receipts file: ${receiptsFilePath}`,
      error instanceof Error ? error : new Error(String(error)) // Ensure Error object for logger
    );
    // Check if error is an instance of Error to access message property
    if (error instanceof Error) {
      throw new Error(`Failed to write receipts data: ${error.message}`);
    }
    throw new Error(`Failed to write receipts data: Unexpected error occurred.`); // Fallback
  }
}

export async function getAllReceipts(): Promise<Receipt[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getAllReceipts`;
  await logger.debug(funcPrefix, "Attempting to get all receipts.");
  try {
    return await readReceiptsFile();
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving all receipts",
      error instanceof Error ? error : new Error(String(error)));
    return []; // Return empty array on error
  }
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptById:${id}`;
  await logger.debug(funcPrefix, "Attempting to get receipt by ID.");
  try {
    const receipts = await readReceiptsFile();
    const receipt = receipts.find((receipt) => receipt.receipt_id === id);
    if (receipt) {
      await logger.debug(funcPrefix, "Receipt found.");
    } else {
      await logger.debug(funcPrefix, "Receipt not found.");
    }
    return receipt || null;
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving receipt by ID",
      error instanceof Error ? error : new Error(String(error)));
    return null; // Return null on error
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
    const receipts = await readReceiptsFile();
    // Optional: Check if receipt ID already exists to prevent duplicates
    if (receipts.some((r) => r.receipt_id === newReceipt.receipt_id)) {
      await logger.warn(
        funcPrefix,
        `Receipt with ID ${newReceipt.receipt_id} already exists. Creation aborted.`,
      );
      // Depending on requirements, you might want to throw an error or return the existing one
      return null;
    }
    receipts.push(newReceipt);
    await writeReceiptsFile(receipts);
    await logger.info(
      funcPrefix,
      `Receipt created successfully: ${newReceipt.receipt_id}`,
    );
    return newReceipt;
  } catch (error) {
    await logger.error(funcPrefix, "Error creating new receipt",
      error instanceof Error ? error : new Error(String(error)));
    return null; // Return null on error
  }
}

/**
 * Checks if the PDF file for a given receipt ID exists.
 * Returns the full path if it exists, otherwise returns null.
 * Logs errors but doesn't throw unless it's a critical configuration issue.
 */
export async function getReceiptPdfPath(
  receiptId: string,
): Promise<string | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptPdfPath:${receiptId}`;
  const filePath = path.join(pdfDirectory, `${receiptId}.pdf`);
  await logger.debug(funcPrefix, `Checking for PDF file at path: ${filePath}`);
  try {
    // Ensure directory exists before checking access
    await fs.mkdir(pdfDirectory, { recursive: true });
    // Check if the file exists and is accessible
    await fs.access(filePath, fs.constants.F_OK); // F_OK checks existence
    await logger.info(funcPrefix, `PDF found at path: ${filePath}`);
    return filePath;
  } catch (error: unknown) { // Changed from any to unknown
    // Type guard for ENOENT error
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === "ENOENT") {
      // File does not exist - this is an expected case if PDF is not ready/failed
      await logger.info(
        funcPrefix,
        `PDF file not found at ${filePath}. It might be generating or failed.`,
      );
    } else {
      // Log other errors (e.g., permission issues) but still return null
      await logger.error(
        funcPrefix,
        `Error accessing PDF file at ${filePath}`,
        error instanceof Error ? error : new Error(String(error)) // Ensure Error object for logger
      );
    }
    return null; // Return null if file doesn't exist or other access error
  }
}

/**
 * Reads the content of a PDF file for a given receipt ID.
 * Returns the content as a Buffer if successful, otherwise returns null.
 */
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
    // First, check if the file exists using getReceiptPdfPath logic
    const existingPath = await getReceiptPdfPath(receiptId);
    if (!existingPath) {
      // Logged within getReceiptPdfPath
      return null;
    }
    // If path exists, attempt to read the file content
    const pdfBuffer = await fs.readFile(filePath);
    await logger.info(
      funcPrefix,
      `Successfully read PDF content (${pdfBuffer.length} bytes).`,
    );
    return pdfBuffer;
  } catch (error: unknown) { // Changed from any to unknown
    // Catch potential errors during readFile itself (though access check reduces likelihood)
    await logger.error(
      funcPrefix,
      `Error reading PDF file content at ${filePath}`,
      error instanceof Error ? error : new Error(String(error)) // Ensure Error object for logger
    );
    return null;
  }
}
