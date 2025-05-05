import { getSellerProfile as getSellerProfileFromData, saveSellerProfile as updateSellerProfileInData } from '@/lib/data-access/seller';
import { SellerProfile, Result } from '@/lib/types';

export async function getSellerProfile(): Promise<SellerProfile | null> {
  try {
    const sellerProfile = await getSellerProfileFromData();
    return sellerProfile;
  } catch (error) {
    console.error('Error getting seller profile:', error);
    return null;
  }
}

export async function updateSellerProfile(profile: SellerProfile): Promise<Result<SellerProfile>> {
  try {
    await updateSellerProfileInData(profile);
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: 'Failed to update seller profile.' };
  }
}