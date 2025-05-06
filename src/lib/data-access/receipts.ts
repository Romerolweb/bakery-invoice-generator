// src/lib/data-access/receipts.ts
import fs from 'fs/promises'; // Direct import
import path from 'path';
import type { Receipt } from '@/lib/types';
import { logger } from '@/lib/services/logging';

const DATA_ACCESS_LOG_PREFIX = 'ReceiptDataAccess';
const dataDirectory = path.join(process.cwd(), 'src', 'lib', 'data');
const receiptsFilePath = path.join(dataDirectory, 'receipts.json');
const pdfDirectory = path.join(dataDirectory, 'receipt-pdfs'); // Define PDF directory path

// Reads the receipts data file
async function readReceiptsFile(): Promise<Receipt[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:readReceiptsFile`;
  try {
     // Ensure the directory exists before reading
    await fs.mkdir(dataDirectory, { recursive: true });
    logger.debug(funcPrefix, `Ensured data directory exists: ${dataDirectory}`);

    const data = await fs.readFile(receiptsFilePath, 'utf8');
    logger.debug(funcPrefix, `Successfully read receipts file: ${receiptsFilePath}`);
    return JSON.parse(data) as Receipt[];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
        logger.warn(funcPrefix, `Receipts file not found at ${receiptsFilePath}, returning empty array.`);
        return []; // File doesn't exist, return empty array
    }
    logger.error(funcPrefix, `Error reading receipts file: ${receiptsFilePath}`, error);
    throw new Error(`Failed to read receipts data: ${error.message}`); // Re-throw other errors
  }
}

// Writes the receipts data file
async function writeReceiptsFile(receipts: Receipt[]): Promise<void> {
   const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:writeReceiptsFile`;
  try {
     // Ensure the directory exists before writing
    await fs.mkdir(dataDirectory, { recursive: true });
    logger.debug(funcPrefix, `Ensured data directory exists: ${dataDirectory}`);

    await fs.writeFile(receiptsFilePath, JSON.stringify(receipts, null, 2));
    logger.debug(funcPrefix, `Successfully wrote receipts file: ${receiptsFilePath}`);
  } catch (error: any) {
     logger.error(funcPrefix, `Error writing receipts file: ${receiptsFilePath}`, error);
     throw new Error(`Failed to write receipts data: ${error.message}`); // Re-throw error
  }
}


export async function getAllReceipts(): Promise<Receipt[]> {
   const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getAllReceipts`;
   logger.debug(funcPrefix, 'Attempting to get all receipts.');
  try {
    return await readReceiptsFile();
  } catch (error) {
    logger.error(funcPrefix, 'Error retrieving all receipts', error);
    return []; // Return empty array on error
  }
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptById:${id}`;
  logger.debug(funcPrefix, 'Attempting to get receipt by ID.');
  try {
    const receipts = await readReceiptsFile();
    const receipt = receipts.find((receipt) => receipt.receipt_id === id);
     if (receipt) {
        logger.debug(funcPrefix, 'Receipt found.');
    } else {
        logger.debug(funcPrefix, 'Receipt not found.');
    }
    return receipt || null;
  } catch (error) {
     logger.error(funcPrefix, 'Error retrieving receipt by ID', error);
     return null; // Return null on error
  }
}

export async function createReceipt(newReceipt: Receipt): Promise<Receipt | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:createReceipt`;
  logger.debug(funcPrefix, `Attempting to create receipt with ID: ${newReceipt.receipt_id}`);
  try {
    const receipts = await readReceiptsFile();
    receipts.push(newReceipt);
    await writeReceiptsFile(receipts);
    logger.info(funcPrefix, `Receipt created successfully: ${newReceipt.receipt_id}`);
    return newReceipt;
  } catch (error) {
    logger.error(funcPrefix, 'Error creating new receipt', error);
    return null; // Return null on error
  }
}

export async function getReceiptPdfPath(receiptId: string): Promise<string | null> {
    const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptPdfPath:${receiptId}`;
    const filePath = path.join(pdfDirectory, `${receiptId}.pdf`);
    try {
        // Check if the file exists
        await fs.access(filePath);
        logger.debug(funcPrefix, `PDF found at path: ${filePath}`);
        return filePath;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
             logger.warn(funcPrefix, `PDF file not found at ${filePath}`);
        } else {
            logger.error(funcPrefix, `Error accessing PDF file at ${filePath}`, error);
        }
        return null; // Return null if file doesn't exist or other error
    }
}

export async function getReceiptPdfContent(receiptId: string): Promise<Buffer | null> {
    const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getReceiptPdfContent:${receiptId}`;
    const filePath = path.join(pdfDirectory, `${receiptId}.pdf`);
    logger.debug(funcPrefix, `Attempting to read PDF content from: ${filePath}`);
    try {
        const pdfBuffer = await fs.readFile(filePath);
        logger.info(funcPrefix, `Successfully read PDF content (${pdfBuffer.length} bytes).`);
        return pdfBuffer;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
             logger.warn(funcPrefix, `PDF file not found at ${filePath}.`);
        } else {
            logger.error(funcPrefix, `Error reading PDF file at ${filePath}`, error);
        }
        return null;
    }
}