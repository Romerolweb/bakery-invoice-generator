// src/lib/data-access/seller.ts
import { SellerProfile } from '@/lib/types';
import { logger } from '../services/logging';
import fs from 'fs/promises';
import path from 'path';

const SELLER_DATA_PATH = path.join(process.cwd(), 'src/lib/data/seller-profile.json');
const DATA_ACCESS_LOG_PREFIX = 'SellerDataAccess';

export async function getSellerProfile(): Promise<SellerProfile | null> {
  try {
    const data = await fs.readFile(SELLER_DATA_PATH, 'utf-8');
    const sellerProfile: SellerProfile = JSON.parse(data);
    logger.info(DATA_ACCESS_LOG_PREFIX, 'Successfully fetched seller profile.');
    return sellerProfile;
  } catch (error) {
    logger.error(DATA_ACCESS_LOG_PREFIX, `Error reading seller profile from file: ${SELLER_DATA_PATH}`, error);
    return null;
  }
}

export async function updateSellerProfile(sellerProfile: SellerProfile): Promise<boolean> {
  try {
    await fs.writeFile(SELLER_DATA_PATH, JSON.stringify(sellerProfile, null, 2), 'utf-8');
    logger.info(DATA_ACCESS_LOG_PREFIX, 'Successfully updated seller profile.');
    return true;
  } catch (error) {
    logger.error(DATA_ACCESS_LOG_PREFIX, `Error writing seller profile to file: ${SELLER_DATA_PATH}`, error);
    return false;
  }
}