import type { SellerProfile } from "@/lib/types";
import { logger } from "@/lib/services/logging";
import { db } from "@/lib/db";
import { sellerProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DATA_ACCESS_LOG_PREFIX = "SellerDataAccess";

export async function getSellerProfile(): Promise<SellerProfile | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getSellerProfile`;
  await logger.debug(funcPrefix, "Attempting to get seller profile.");
  try {
    const result = await db.select().from(sellerProfiles).limit(1);
    const profile = result[0];
    if (profile) {
      // Remove the internal ID when returning to application
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...rest } = profile;
      return rest as SellerProfile;
    }
    return null;
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving seller profile", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function updateSellerProfile(
  profile: SellerProfile,
): Promise<boolean> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:updateSellerProfile`;
  await logger.debug(funcPrefix, "Attempting to update seller profile.");
  try {
    // Check if a profile exists
    const existing = await db.select().from(sellerProfiles).limit(1);

    if (existing.length > 0) {
      // Update existing
      await db.update(sellerProfiles)
        .set(profile)
        .where(eq(sellerProfiles.id, existing[0].id));
    } else {
      // Create new
      await db.insert(sellerProfiles).values(profile);
    }

    await logger.info(funcPrefix, "Seller profile updated successfully.");
    return true;
  } catch (error) {
    await logger.error(funcPrefix, "Error updating seller profile", error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

export async function deleteSellerProfile(): Promise<boolean> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:deleteSellerProfile`;
  await logger.debug(funcPrefix, "Attempting to delete seller profile.");
  try {
    await db.delete(sellerProfiles);
    await logger.info(funcPrefix, "Seller profile deleted successfully.");
    return true;
  } catch (error) {
    await logger.error(funcPrefix, "Error deleting seller profile", error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}
