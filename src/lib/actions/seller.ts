import { getSellerProfileFromData } from '@/lib/data-access/seller';
import { SellerProfile } from '@/lib/types';

export async function getSellerProfile(): Promise<SellerProfile | null> {
  try {
    const sellerProfile = await getSellerProfileFromData();
    return sellerProfile;
  } catch (error) {
    console.error('Error getting seller profile:', error);
    return null;
  }
}