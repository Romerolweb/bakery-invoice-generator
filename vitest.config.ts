import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react"; // Required for testing React components if needed later
import path from "path";

export default defineConfig({
  plugins: [react()], // Enable React testing
  test: {
    globals: true, // Use global APIs like describe, it, expect
    environment: "jsdom", // Simulate browser environment for things like window, document
    setupFiles: ['./vitest.setup.ts'], // Setup file for testing library
    include: [
      "**/__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"
    ],
    alias: {
      "@": path.resolve(__dirname, "./src"), // Match tsconfig paths
    },
    // Optional: configure coverage
    // coverage: {
    //   provider: 'v8', // or 'istanbul'
    //   reporter: ['text', 'json', 'html'],
    // },
  },
});
