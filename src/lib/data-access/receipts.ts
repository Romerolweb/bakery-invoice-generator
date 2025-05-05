import { Receipt } from '@/lib/types';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIRECTORY = path.join(process.cwd(), 'src', 'lib', 'data');
const RECEIPTS_FILE = path.join(DATA_DIRECTORY, 'receipts.json');

export async function getAllReceipts(): Promise<Receipt[]> {
  try {
    const fileContent = await fs.readFile(RECEIPTS_FILE, 'utf-8');
    return JSON.parse(fileContent) as Receipt[];
  } catch (error) {
    console.error('Error reading receipts data:', error);
    return [];
  }
}

export async function getReceiptById(id: string): Promise<Receipt | null> {
  const receipts = await getAllReceipts();
  return receipts.find((receipt) => receipt.receipt_id === id) || null;
}

export async function createNewReceipt(newReceipt: Receipt): Promise<Receipt> {
  const receipts = await getAllReceipts();
  receipts.push(newReceipt);
  try {
    await fs.writeFile(RECEIPTS_FILE, JSON.stringify(receipts, null, 2), 'utf-8');
    return newReceipt;
  } catch (error) {
    console.error('Error creating new receipt:', error);
    throw new Error('Failed to create new receipt.');
  }
}