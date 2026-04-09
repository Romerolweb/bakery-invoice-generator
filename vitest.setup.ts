import "@testing-library/jest-dom";

// Guard against non-browser environments (e.g., when running with @vitest-environment node)
if (typeof window !== "undefined") {
  // Mock CSS imports
  Object.defineProperty(window, "CSS", { value: null });
  Object.defineProperty(window, "getComputedStyle", {
    value: () => ({
      display: "none",
      appearance: ["-webkit-appearance"],
    }),
  });

  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 1,
  });

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 1,
  });
}
