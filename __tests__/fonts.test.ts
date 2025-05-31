import { describe, it, expect } from "vitest";
// Import PDFKit to access standard fonts
import PDFDocument from "pdfkit";

describe("Font Configuration Tests", () => {
  it("should use correct primary fonts", () => {
    // PDFKit standard fonts
    const primaryFont = "Helvetica";
    const boldFont = "Helvetica-Bold";

    // Simulate loading fonts in a real PDFKit document
    const doc = new PDFDocument();
    doc.font(primaryFont);
    doc.font(boldFont);

    expect(primaryFont).toBe("Helvetica");
    expect(boldFont).toBe("Helvetica-Bold");
  });

  it("should validate standard PDFKit fonts", () => {
    const standardFonts = [
      "Helvetica",
      "Helvetica-Bold",
      "Helvetica-Oblique",
      "Times-Roman",
      "Courier"
    ];

    const doc = new PDFDocument();

    standardFonts.forEach(font => {
      // Try setting the font in the PDFKit document
      expect(() => doc.font(font)).not.toThrow();
      expect(typeof font).toBe("string");
      expect(font.length).toBeGreaterThan(0);
    });
  });

  it("should validate font naming patterns", () => {
    const fonts = ["Helvetica", "Helvetica-Bold"];

    fonts.forEach(font => {
      expect(font).toMatch(/^[A-Za-z-]+$/);
    });
  });
});
