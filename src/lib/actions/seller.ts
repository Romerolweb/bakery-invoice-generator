'use server';

import type { SellerProfile } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/services/logging'; // Import logger

const LOG_PREFIX = 'SellerAction';

const DATA_DIR = path.join(process.cwd(), 'src/lib/data');
const DATA_FILE = path.join(DATA_DIR, 'seller-profile.json');

const defaultSellerProfile: SellerProfile = {
    name: 'Your Bakery Name',
    business_address: '123 Pastry Lane, Bakeville, VIC 3000',
    ABN_or_ACN: '00 000 000 000',
    contact_email: 'hello@yourbakery.com',
    phone: '',
    logo_url: '',
};

// Ensure data directory exists
async function ensureDataDirectoryExists() {
    const funcPrefix = `${LOG_PREFIX}:ensureDataDir`;
    try {
        // No console log here, called frequently
        await fs.mkdir(DATA_DIR, { recursive: true });
         logger.debug(funcPrefix, `Seller profile data directory ensured: ${DATA_DIR}`);
    } catch (error) {
        logger.error(funcPrefix, 'FATAL: Error creating seller profile data directory', error);
        throw new Error(`Failed to ensure seller profile data directory exists: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read data
async function readSellerProfile(): Promise<SellerProfile> {
  const funcPrefix = `${LOG_PREFIX}:readSellerProfile`;
  let fileContent = '';
  try {
     await ensureDataDirectoryExists();
     logger.debug(funcPrefix, `Attempting to read seller profile: ${DATA_FILE}`);
     fileContent = await fs.readFile(DATA_FILE, 'utf-8');
     const jsonData = JSON.parse(fileContent);
     const mergedProfile = { ...defaultSellerProfile, ...jsonData };
     logger.info(funcPrefix, `Successfully read and merged seller profile from ${DATA_FILE}.`);
     return mergedProfile;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
        logger.warn(funcPrefix, `Seller profile file (${DATA_FILE}) not found, attempting to write default.`);
        try {
            await writeSellerProfile(defaultSellerProfile); // writeSellerProfile includes its own logging
            logger.info(funcPrefix, `Default seller profile successfully written.`);
            return defaultSellerProfile;
        } catch (writeError: any) {
            logger.error(funcPrefix, `Failed to write default seller profile during read attempt`, writeError);
            // Return default anyway, but log the error
            return defaultSellerProfile;
        }
    } else if (error instanceof SyntaxError) {
        logger.error(funcPrefix, `Error parsing JSON from seller profile ${DATA_FILE}. Content: "${fileContent.substring(0,100)}..."`, error);
        logger.warn(funcPrefix, `Returning default seller profile due to parsing error.`);
        return defaultSellerProfile;
    }
    logger.error(funcPrefix, `Error reading seller profile file (${DATA_FILE})`, error);
    logger.warn(funcPrefix, `Returning default seller profile due to read error.`);
    return defaultSellerProfile;
  }
}

// Helper function to write data
async function writeSellerProfile(profile: SellerProfile): Promise<void> {
  const funcPrefix = `${LOG_PREFIX}:writeSellerProfile`;
  try {
     await ensureDataDirectoryExists();
     const dataToWrite: SellerProfile = {
         ...defaultSellerProfile,
         ...profile,
     };
     const profileString = JSON.stringify(dataToWrite, null, 2);
     logger.debug(funcPrefix, `Attempting to write seller profile to ${DATA_FILE}`);
     await fs.writeFile(DATA_FILE, profileString, 'utf-8');
     logger.info(funcPrefix, `Successfully wrote seller profile to ${DATA_FILE}.`);
  } catch (error: any) {
    logger.error(funcPrefix, `Error writing seller profile file (${DATA_FILE})`, error);
    throw new Error(`Failed to save seller profile: ${error.message}`);
  }
}

// Run directory check once on module load
ensureDataDirectoryExists().catch(err => {
     logger.error(LOG_PREFIX, "Initial seller profile directory check failed on module load", err);
});


export async function getSellerProfile(): Promise<SellerProfile> {
  const funcPrefix = `${LOG_PREFIX}:getSellerProfile`;
  logger.info(funcPrefix, 'Fetching seller profile.');
  return await readSellerProfile();
}

export async function updateSellerProfile(
  profile: SellerProfile
): Promise<{ success: boolean; message?: string; profile?: SellerProfile }> {
    const funcPrefix = `${LOG_PREFIX}:updateSellerProfile`;
    logger.info(funcPrefix, 'Attempting to update seller profile.', profile);
    // Basic validation
    if (!profile.name || !profile.business_address || !profile.ABN_or_ACN || !profile.contact_email) {
      logger.warn(funcPrefix, 'Validation failed: Missing required seller profile fields.');
      return { success: false, message: 'Business Name, Address, ABN/ACN, and Email are required fields.' };
    }
    const abnRegex = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/;
    const acnRegex = /^\d{3}\s?\d{3}\s?\d{3}$/;
    if (!abnRegex.test(profile.ABN_or_ACN) && !acnRegex.test(profile.ABN_or_ACN)) {
        logger.warn(funcPrefix, 'Validation failed: Invalid ABN/ACN format.');
        return { success: false, message: 'Invalid ABN or ACN format provided.' };
    }
    logger.debug(funcPrefix, 'Validation successful.');

    try {
        const profileToSave: SellerProfile = {
            ...defaultSellerProfile,
            ...profile
        };
        await writeSellerProfile(profileToSave); // writeSellerProfile handles logging
        logger.info(funcPrefix, 'Seller profile update successful.');
        return { success: true, profile: profileToSave };
    } catch (error: any) {
        logger.error(funcPrefix, 'Error during seller profile update', error);
        return { success: false, message: `Failed to update profile: ${error.message || 'Unknown error'}` };
    }
}
