import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react"; // Required for testing React components if needed later
import path from "path";

export default defineConfig({
  // plugins: [react()], // Uncomment if you test React components directly
  test: {
    globals: true, // Use global APIs like describe, it, expect
    environment: "jsdom", // Simulate browser environment for things like window, document
    setupFiles: [], // Optional: path to setup files (e.g., './tests/setup.ts')
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
