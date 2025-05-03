'use server';

import type { SellerProfile } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';

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
    try {
        // No console log here, called frequently
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error('FATAL: Error creating seller profile data directory:', error);
        throw new Error(`Failed to ensure seller profile data directory exists: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read data
async function readSellerProfile(): Promise<SellerProfile> {
  let fileContent = '';
  try {
     await ensureDataDirectoryExists();
     console.log(`Attempting to read seller profile: ${DATA_FILE}`);
     fileContent = await fs.readFile(DATA_FILE, 'utf-8');
     const jsonData = JSON.parse(fileContent);
     const mergedProfile = { ...defaultSellerProfile, ...jsonData };
     console.log(`Successfully read and merged seller profile from ${DATA_FILE}.`);
     return mergedProfile;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
        console.log(`Seller profile file (${DATA_FILE}) not found, attempting to write default.`);
        try {
            await writeSellerProfile(defaultSellerProfile); // writeSellerProfile includes its own logging
            console.log(`Default seller profile successfully written.`);
            return defaultSellerProfile;
        } catch (writeError: any) {
            console.error(`Failed to write default seller profile during read attempt:`, writeError);
            // Return default anyway, but log the error
            return defaultSellerProfile;
        }
    } else if (error instanceof SyntaxError) {
        console.error(`Error parsing JSON from seller profile ${DATA_FILE}. Content: "${fileContent.substring(0,100)}..."`, error);
        console.warn(`Returning default seller profile due to parsing error.`);
        return defaultSellerProfile;
    }
    console.error(`Error reading seller profile file (${DATA_FILE}):`, error);
    console.warn(`Returning default seller profile due to read error.`);
    return defaultSellerProfile;
  }
}

// Helper function to write data
async function writeSellerProfile(profile: SellerProfile): Promise<void> {
  try {
     await ensureDataDirectoryExists();
     const dataToWrite: SellerProfile = {
         ...defaultSellerProfile,
         ...profile,
     };
     const profileString = JSON.stringify(dataToWrite, null, 2);
     console.log(`Attempting to write seller profile to ${DATA_FILE}`);
     await fs.writeFile(DATA_FILE, profileString, 'utf-8');
     console.log(`Successfully wrote seller profile to ${DATA_FILE}.`);
  } catch (error: any) {
    console.error(`Error writing seller profile file (${DATA_FILE}):`, error);
    throw new Error(`Failed to save seller profile: ${error.message}`);
  }
}

// Run directory check once on module load
ensureDataDirectoryExists().catch(err => {
     console.error("Initial seller profile directory check failed on module load:", err);
});


export async function getSellerProfile(): Promise<SellerProfile> {
  console.log('getSellerProfile action called.');
  return await readSellerProfile();
}

export async function updateSellerProfile(
  profile: SellerProfile
): Promise<{ success: boolean; message?: string; profile?: SellerProfile }> {
    console.log('updateSellerProfile action called with profile:', profile);
    // Basic validation
    if (!profile.name || !profile.business_address || !profile.ABN_or_ACN || !profile.contact_email) {
      console.error('Validation failed: Missing required seller profile fields.');
      return { success: false, message: 'Business Name, Address, ABN/ACN, and Email are required fields.' };
    }
    const abnRegex = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/;
    const acnRegex = /^\d{3}\s?\d{3}\s?\d{3}$/;
    if (!abnRegex.test(profile.ABN_or_ACN) && !acnRegex.test(profile.ABN_or_ACN)) {
        console.error('Validation failed: Invalid ABN/ACN format.');
        return { success: false, message: 'Invalid ABN or ACN format provided.' };
    }

    try {
        const profileToSave: SellerProfile = {
            ...defaultSellerProfile,
            ...profile
        };
        await writeSellerProfile(profileToSave); // writeSellerProfile handles logging
        console.log('Seller profile update successful.');
        return { success: true, profile: profileToSave };
    } catch (error: any) {
        console.error('Error during seller profile update:', error);
        return { success: false, message: `Failed to update profile: ${error.message || 'Unknown error'}` };
    }
}
