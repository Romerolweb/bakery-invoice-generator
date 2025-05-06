// src/lib/actions/seller.ts
"use server";

import { z } from "zod";
import * as SellerDataAccess from "@/lib/data-access/seller";
import { SellerProfile } from "@/lib/types";
import { logger } from "@/lib/services/logging";

const ACTION_LOG_PREFIX = "SellerActions";

// --- Schemas for Validation ---
const abnRegex = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/;
const acnRegex = /^\d{3}\s?\d{3}\s?\d{3}$/;

const sellerProfileSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  business_address: z.string().min(1, "Business address is required"),
  ABN_or_ACN: z
    .string()
    .min(1, "ABN or ACN is required")
    .refine(
      (val) => abnRegex.test(val) || acnRegex.test(val),
      "Invalid ABN or ACN format (e.g., 11 111 111 111 or 111 111 111)",
    )
    .transform(
      (val) => val.replace(/\s/g, ""), // Remove spaces for consistency
    ),
  contact_email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  logo_url: z.string().url("Invalid URL format").optional().or(z.literal("")),
});

type SellerProfileFormData = z.infer<typeof sellerProfileSchema>;

// --- Action Results ---
interface ActionResult<T = null> {
  success: boolean;
  message?: string;
  profile?: T extends SellerProfile ? SellerProfile : null;
  errors?: Record<string, string[]>; // For validation errors
}

// --- Server Actions ---

export async function getSellerProfile(): Promise<SellerProfile | null> {
  const funcPrefix = `${ACTION_LOG_PREFIX}:getSellerProfile`;
  await logger.debug(funcPrefix, "Executing getSellerProfile server action.");
  try {
    const profile = await SellerDataAccess.getSellerProfile();
    if (profile) {
      await logger.info(funcPrefix, "Seller profile retrieved successfully.");
    } else {
      await logger.info(funcPrefix, "No seller profile found.");
    }
    return profile;
  } catch (error) {
    await logger.error(funcPrefix, "Error getting seller profile", error);
    return null;
  }
}

export async function updateSellerProfile(
  formData: SellerProfileFormData,
): Promise<ActionResult<SellerProfile>> {
  const funcPrefix = `${ACTION_LOG_PREFIX}:updateSellerProfile`;
  await logger.debug(
    funcPrefix,
    "Executing updateSellerProfile server action.",
  );

  const validationResult = sellerProfileSchema.safeParse(formData);

  if (!validationResult.success) {
    const errors = validationResult.error.flatten().fieldErrors;
    await logger.warn(funcPrefix, "Validation failed.", errors);
    return {
      success: false,
      message: "Validation failed. Please check the fields.",
      errors,
    };
  }

  await logger.debug(
    funcPrefix,
    "Validation successful. Proceeding to update seller profile.",
  );
  try {
    const success = await SellerDataAccess.updateSellerProfile(
      validationResult.data,
    );
    if (success) {
      await logger.info(funcPrefix, "Seller profile updated successfully.");
      return { success: true, profile: validationResult.data };
    } else {
      await logger.error(
        funcPrefix,
        "Data access layer failed to update seller profile.",
      );
      return { success: false, message: "Failed to save seller profile data." };
    }
  } catch (error) {
    await logger.error(
      funcPrefix,
      "Unexpected error during seller profile update",
      error,
    );
    return { success: false, message: "An unexpected error occurred." };
  }
}
