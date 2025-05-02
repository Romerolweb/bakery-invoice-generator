'use server';

import type { SellerProfile } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src/lib/data/seller-profile.json');

// Default profile structure
const defaultSellerProfile: SellerProfile = {
    name: 'Your Bakery Name',
    business_address: '123 Pastry Lane, Bakeville, VIC 3000',
    ABN_or_ACN: '00 000 000 000',
    contact_email: 'hello@yourbakery.com',
    phone: '', // Add default empty phone
    logo_url: '', // Add default empty logo_url
};


// Helper function to read data
async function readSellerProfile(): Promise<SellerProfile> {
  try {
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    // Merge parsed data with defaults to ensure all keys exist
    return { ...defaultSellerProfile, ...jsonData };
  } catch (error: any) {
    // If file doesn't exist or is invalid, return default
    if (error.code === 'ENOENT') {
      console.log("Seller profile file not found, returning default.");
      // Try to write the default profile if the file doesn't exist
       try {
            await writeSellerProfile(defaultSellerProfile);
            return defaultSellerProfile;
        } catch (writeError) {
            console.error('Failed to write default seller profile:', writeError);
            // Return default anyway, but log the error
            return defaultSellerProfile;
        }
    }
    console.error('Error reading seller profile:', error);
    // Return default in case of other errors too, ensuring the app doesn't crash
     return defaultSellerProfile;
  }
}

// Helper function to write data
async function writeSellerProfile(profile: SellerProfile): Promise<void> {
  try {
    // Ensure optional fields are included even if empty before writing
    const dataToWrite: SellerProfile = {
        ...defaultSellerProfile, // Start with defaults
        ...profile, // Overlay with provided data
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(dataToWrite, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing seller profile:', error);
    throw new Error('Failed to save seller profile.');
  }
}

export async function getSellerProfile(): Promise<SellerProfile> {
  return await readSellerProfile();
}

export async function updateSellerProfile(
  profile: SellerProfile
): Promise<{ success: boolean; message?: string; profile?: SellerProfile }> {
    // Basic validation (can be expanded with Zod)
    // Note: phone and logo_url are optional, so don't require them here
    if (!profile.name || !profile.business_address || !profile.ABN_or_ACN || !profile.contact_email) {
      return { success: false, message: 'Business Name, Address, ABN/ACN, and Email are required fields.' };
    }
    // Add ABN validation here if needed

    try {
        // Ensure we write all fields, including potentially empty optional ones
        const profileToSave: SellerProfile = {
            ...defaultSellerProfile, // Ensure all keys are present
            ...profile // Overwrite with new data
        };
        await writeSellerProfile(profileToSave);
        return { success: true, profile: profileToSave };
    } catch (error: any) {
        return { success: false, message: error.message || 'Failed to update profile.' };
    }
}

// Ensure data directory exists
async function ensureDataDirectoryExists() {
    const dir = path.dirname(DATA_FILE);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

ensureDataDirectoryExists();
