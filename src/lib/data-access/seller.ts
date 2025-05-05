// src/lib/data-access/seller.ts
import { SellerProfile } from '@/lib/types';
import { logger } from '../services/logging';

const SELLER_DATA_PATH = '/src/lib/data/seller-profile.json';
const DATA_ACCESS_LOG_PREFIX = 'SellerDataAccess';

export async function getSellerProfile(): Promise<SellerProfile | null> {
  try {
    const sellerProfile: SellerProfile = await fetch(SELLER_DATA_PATH).then(res => res.json());
    logger.info(DATA_ACCESS_LOG_PREFIX, 'Successfully fetched seller profile.');
    return sellerProfile;
  } catch (error) {
    logger.error(DATA_ACCESS_LOG_PREFIX, `Error reading seller profile from file: ${SELLER_DATA_PATH}`, error);
    return null;
  }
}

export async function updateSellerProfile(sellerProfile: SellerProfile): Promise<boolean> {
  try {
    await fetch(SELLER_DATA_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sellerProfile, null, 2),
    });
    logger.info(DATA_ACCESS_LOG_PREFIX, 'Successfully updated seller profile.');
    return true;
  } catch (error) {
    logger.error(DATA_ACCESS_LOG_PREFIX, `Error writing seller profile to file: ${SELLER_DATA_PATH}`, error);
    return false;
  }
}