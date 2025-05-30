// PDF Template Registry - Centralized template selection configuration
import type { PdfReceiptTemplateConstructor } from "./IPdfReceiptTemplate";
import { DefaultReceiptTemplate } from "./DefaultReceiptTemplate";

// Template Registry Configuration
export const PDF_TEMPLATE_CONFIG = {
  // Available templates
  TEMPLATES: {
    DEFAULT: DefaultReceiptTemplate,
    // Add other template implementations here in the future:
    // MODERN: ModernReceiptTemplate,
    // MINIMALIST: MinimalistReceiptTemplate,
  },
  
  // Current selected template - change this constant to switch templates
  SELECTED_TEMPLATE: DefaultReceiptTemplate as PdfReceiptTemplateConstructor,
} as const;

// Export the selected template for easy import
export const CURRENT_PDF_TEMPLATE = PDF_TEMPLATE_CONFIG.SELECTED_TEMPLATE;
