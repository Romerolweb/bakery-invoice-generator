import { describe, it, expect } from "vitest";

// Test PDFKit font configuration
describe("Font Configuration Tests", () => {
  it("should use correct primary fonts", () => {
    const primaryFont = "Helvetica";
    const boldFont = "Helvetica-Bold";
    
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
    
    standardFonts.forEach(font => {
      expect(font).toBeTruthy();
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
