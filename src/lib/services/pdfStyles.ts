// PDF Styling and Constants

// Use built-in PDFKit standard fonts (no external files needed)
// PDFKit has these 14 built-in fonts available without external files:
// Helvetica, Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique
// Times-Roman, Times-Bold, Times-Italic, Times-BoldItalic
// Courier, Courier-Bold, Courier-Oblique, Courier-BoldOblique
// Symbol, ZapfDingbats
export const FONT_REGULAR = "Helvetica";
export const FONT_BOLD = "Helvetica-Bold";

export const PAGE_MARGIN = 50;

export const HEADER_FONT_SIZE = 20;
export const SECTION_LABEL_FONT_SIZE = 12;
export const BODY_FONT_SIZE = 10;
export const TABLE_FONT_SIZE = 10;
export const TOTALS_FONT_SIZE = 10;
export const TOTALS_TOTAL_FONT_SIZE = 12;
export const FOOTER_FONT_SIZE = 8;

export const COLOR_BLACK = "#000000";
export const COLOR_GREY_LIGHT = "#cccccc";
export const COLOR_GREY_MEDIUM = "#aaaaaa";

export const LINE_THIN = 0.5;

// Column Positions (relative to margins)
// These might need adjustment based on page width and margins if those become dynamic.
// For a standard Letter/A4 page with 50pt margins:
// Page width (approx 612pt for Letter) - 2*50pt margin = 512pt drawable area.

export const ITEM_COL_X_OFFSET = 0;
export const GST_COL_X_OFFSET = 200; // Relative to ITEM_COL_X_OFFSET + itemWidth
export const QTY_COL_X_OFFSET = 270; // Relative
export const PRICE_COL_X_OFFSET = 350; // Relative
export const TOTAL_COL_X_OFFSET = 430; // Relative

// Approximate widths, can be calculated dynamically too
export const ITEM_COL_DEFAULT_WIDTH = 190; // Example width
// Other column widths can be derived or set explicitly

export const TABLE_BOTTOM_MARGIN = 70; // Space for totals below table
export const TOTALS_SECTION_HEIGHT_ESTIMATE = 60; // For page break calculations
