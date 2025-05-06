// src/lib/data-access/seller.ts
import fs from 'fs/promises'; // Direct import
import path from 'path';
import type { SellerProfile } from '@/lib/types';
import { logger } from '@/lib/services/logging'; // Adjusted path

const DATA_ACCESS_LOG_PREFIX = 'SellerDataAccess';
const dataDirectory = path.join(process.cwd(), 'src/lib/data');
const sellerProfileFilePath = path.join(dataDirectory, 'seller-profile.json');

// Reads the seller profile data file
async function readSellerProfileFile(): Promise<SellerProfile | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:readSellerProfileFile`;
  try {
    const data = await fs.readFile(sellerProfileFilePath, 'utf8');
    logger.debug(funcPrefix, `Successfully read seller profile file: ${sellerProfileFilePath}`);
    return JSON.parse(data) as SellerProfile;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
       logger.warn(funcPrefix, `Seller profile file not found at ${sellerProfileFilePath}, returning null.`);
       return null; // File doesn't exist
    }
    logger.error(funcPrefix, `Error reading seller profile file: ${sellerProfileFilePath}`, error);
    throw new Error(`Failed to read seller profile data: ${error.message}`); // Re-throw other errors
  }
}

// Writes the seller profile data file
async function writeSellerProfileFile(profile: SellerProfile): Promise<void> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:writeSellerProfileFile`;
  try {
    await fs.writeFile(sellerProfileFilePath, JSON.stringify(profile, null, 2));
    logger.debug(funcPrefix, `Successfully wrote seller profile file: ${sellerProfileFilePath}`);
  } catch (error: any) {
    logger.error(funcPrefix, `Error writing seller profile file: ${sellerProfileFilePath}`, error);
    throw new Error(`Failed to write seller profile data: ${error.message}`); // Re-throw error
  }
}

export async function getSellerProfile(): Promise<SellerProfile | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getSellerProfile`;
  logger.debug(funcPrefix, 'Attempting to get seller profile.');
  try {
    return await readSellerProfileFile();
  } catch (error) {
    logger.error(funcPrefix, 'Error retrieving seller profile', error);
    return null;
  }
}

export async function updateSellerProfile(profile: SellerProfile): Promise<boolean> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:updateSellerProfile`;
  logger.debug(funcPrefix, 'Attempting to update seller profile.');
  try {
    await writeSellerProfileFile(profile);
    logger.info(funcPrefix, 'Seller profile updated successfully.');
    return true;
  } catch (error) {
    logger.error(funcPrefix, 'Error updating seller profile', error);
    return false;
  }
}
