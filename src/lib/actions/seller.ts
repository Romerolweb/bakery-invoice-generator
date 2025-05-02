'use server';

import type { SellerProfile } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src/lib/data/seller-profile.json');

// Helper function to read data
async function readSellerProfile(): Promise<SellerProfile> {
  try {
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error: any) {
    // If file doesn't exist or is invalid, return default
    if (error.code === 'ENOENT') {
      console.log("Seller profile file not found, returning default.");
      return {
        name: 'Your Bakery Name',
        business_address: '123 Pastry Lane, Bakeville, VIC 3000',
        ABN_or_ACN: '00 000 000 000',
        contact_email: 'hello@yourbakery.com',
      };
    }
    console.error('Error reading seller profile:', error);
    // Return default in case of other errors too, ensuring the app doesn't crash
     return {
        name: 'Your Bakery Name',
        business_address: '123 Pastry Lane, Bakeville, VIC 3000',
        ABN_or_ACN: '00 000 000 000',
        contact_email: 'hello@yourbakery.com',
      };
  }
}

// Helper function to write data
async function writeSellerProfile(profile: SellerProfile): Promise<void> {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(profile, null, 2), 'utf-8');
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
    if (!profile.name || !profile.business_address || !profile.ABN_or_ACN || !profile.contact_email) {
      return { success: false, message: 'All seller profile fields are required.' };
    }
    // Add ABN validation here if needed

    try {
        await writeSellerProfile(profile);
        return { success: true, profile: profile };
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
