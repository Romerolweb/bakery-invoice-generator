// src/lib/recordChanges.ts
import fs from "fs";
import path from "path";
import { format } from "date-fns";
import { logger } from "./services/logging"; // Import logger for internal use if needed

const changesLogPath = path.join(process.cwd(), "changes.log");
const logDirectory = path.dirname(changesLogPath);

// Ensure log directory exists synchronously on first log attempt if needed
let changesLogDirectoryEnsured = false;
async function ensureChangesLogDirectoryExists() {
  // Made async
  if (changesLogDirectoryEnsured || typeof window !== "undefined") return; // Only run on server
  try {
    // Dynamically import 'fs' only when needed on the server
    const fs = await import("fs");
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
      console.log(
        `[ChangeRecorder] Created changes log directory: ${logDirectory}`,
      );
    }
    changesLogDirectoryEnsured = true;
  } catch (error) {
    await logger.error(
      "[ChangeRecorder] FATAL: Error creating changes log directory",
      error instanceof Error ? error.message : String(error),
    ); // Await logger
    changesLogDirectoryEnsured = true; // Prevent further attempts
  }
}

/**
 * Records a description of changes made to a specific file.
 * Appends the record to changes.log.
 * @param filePath - The full path of the file that was changed.
 * @param description - A brief description of the changes made.
 */
export async function recordChange(
  filePath: string,
  description: string,
): Promise<void> {
  if (typeof window !== "undefined") return; // Don't run on client

  await ensureChangesLogDirectoryExists(); // Ensure dir exists before writing

  const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  const logEntry = `[${timestamp}] File: ${filePath}\nChange: ${description}\n---\n`;

  try {
    const fs = await import("fs"); // Dynamic import
    fs.appendFile(changesLogPath, logEntry, async (err) => {
      // Make callback async
      if (err) {
        await logger.error(
          "[ChangeRecorder] Error writing to changes log:",
          err instanceof Error ? err.message : String(err),
        ); // Await logger
      }
    });
  } catch (fsError) {
    await logger.error(
      "[ChangeRecorder] Error importing or using fs for change logging:",
      fsError instanceof Error ? fsError.message : String(fsError),
    ); // Await logger
  }
}

// Example Usage (could be called after a file modification)
// import { recordChange } from '@/lib/recordChanges';
// recordChange('src/components/ui/button.tsx', 'Updated button styles for better accessibility.');
