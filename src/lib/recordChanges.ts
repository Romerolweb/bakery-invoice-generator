// src/lib/recordChanges.ts
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

const changesLogPath = path.join(process.cwd(), 'changes.log');
const logDirectory = path.dirname(changesLogPath);

// Ensure log directory exists synchronously on first log attempt if needed
let changesLogDirectoryEnsured = false;
function ensureChangesLogDirectoryExistsSync() {
    if (changesLogDirectoryEnsured) return;
    try {
        if (!fs.existsSync(logDirectory)) {
            fs.mkdirSync(logDirectory, { recursive: true });
            console.log(`[ChangeRecorder] Created changes log directory: ${logDirectory}`);
        }
        changesLogDirectoryEnsured = true;
    } catch (error) {
        console.error('[ChangeRecorder] FATAL: Error creating changes log directory', error);
        changesLogDirectoryEnsured = true; // Prevent further attempts
    }
}


/**
 * Records a description of changes made to a specific file.
 * Appends the record to changes.log.
 * @param filePath - The full path of the file that was changed.
 * @param description - A brief description of the changes made.
 */
export function recordChange(filePath: string, description: string): void {
    ensureChangesLogDirectoryExistsSync(); // Ensure dir exists before writing

    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const logEntry = `[${timestamp}] File: ${filePath}\nChange: ${description}\n---\n`;

    fs.appendFile(changesLogPath, logEntry, (err) => {
        if (err) {
            console.error('[ChangeRecorder] Error writing to changes log:', err);
        }
    });
}

// Example Usage (could be called after a file modification)
// import { recordChange } from '@/lib/recordChanges';
// recordChange('src/components/ui/button.tsx', 'Updated button styles for better accessibility.');
