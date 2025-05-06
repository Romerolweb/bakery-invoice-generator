// src/lib/services/logging.ts
import { format } from 'date-fns';
import fs from 'fs'; // Use standard fs for appendFile callback
import path from 'path';

type LogData = Record<string, any> | string | number | boolean | Error | undefined;

// Define log levels
enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

// Logger configuration
const config = {
  logLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  logToFile: true, // Enable file logging
  logFilePath: path.join(process.cwd(), 'logs', 'app.log'), // Path to the log file
  logLevelsToFile: [LogLevel.ERROR, LogLevel.WARN], // Log only errors and warnings to file by default
  // logLevelsToFile: [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR], // Uncomment to log everything to file
};

const logDirectory = path.dirname(config.logFilePath);

// Ensure log directory exists synchronously on first log attempt if needed
let logDirectoryEnsured = false;
function ensureLogDirectoryExistsSync() {
    if (logDirectoryEnsured) return;
    try {
        if (!fs.existsSync(logDirectory)) {
            fs.mkdirSync(logDirectory, { recursive: true });
            console.log(`[Logger] Created log directory: ${logDirectory}`); // Use console here as logger might not be ready
        }
        logDirectoryEnsured = true;
    } catch (error) {
        console.error('[Logger] FATAL: Error creating log directory', error);
        // Disable file logging if directory creation fails
        config.logToFile = false;
        logDirectoryEnsured = true; // Prevent further attempts
    }
}

// Check if a level is enabled based on config
function isLevelEnabled(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
}

// The core logging function
function log(level: LogLevel, prefix: string, message: string, data?: LogData): void {
    if (!isLevelEnabled(level)) {
        return;
    }

    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
    const logPrefix = `[${timestamp}] [${level}]${prefix ? ` [${prefix}]` : ''}:`;

    // --- Console Logging ---
    const consoleLogMethod = level === LogLevel.ERROR ? console.error
                           : level === LogLevel.WARN ? console.warn
                           : console.log; // INFO and DEBUG use console.log

    let dataStringForConsole = '';
    if (data) {
        if (data instanceof Error) {
            // Log error stack trace nicely for console
            dataStringForConsole = `\nError: ${data.stack || data.message}`;
        } else {
            try {
                dataStringForConsole = `\nData: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`;
            } catch (e) {
                dataStringForConsole = '\nData: [Could not stringify data]';
            }
        }
    }
    consoleLogMethod(`${logPrefix} ${message}${dataStringForConsole}`);

    // --- File Logging ---
    if (config.logToFile && config.logLevelsToFile.includes(level)) {
        ensureLogDirectoryExistsSync(); // Ensure directory exists before writing
        if (!config.logToFile) return; // Check again in case ensure failed

        let dataStringForFile = '';
         if (data) {
            if (data instanceof Error) {
                // Include stack trace in file log
                dataStringForFile = `\nError: ${data.stack || data.message}`;
            } else {
                 try {
                    dataStringForFile = ` | Data: ${typeof data === 'object' ? JSON.stringify(data) : data}`; // More compact for file log
                 } catch (e) {
                     dataStringForFile = ' | Data: [Could not stringify data]';
                 }
            }
        }

        const fileLogMessage = `${logPrefix} ${message}${dataStringForFile}\n`; // Add newline for each entry

        fs.appendFile(config.logFilePath, fileLogMessage, (err) => {
            if (err) {
                console.error('[Logger] Error writing to log file:', err);
                // Consider disabling file logging temporarily if errors persist
                // config.logToFile = false;
            }
        });
    }
}

// Exported logger functions interface remains the same
export const logger: {
  info: (prefix: string, message: string, data?: LogData) => void;
  warn: (prefix: string, message: string, data?: LogData) => void;
  error: (prefix: string, message: string, error?: LogData) => void;
  debug: (prefix: string, message: string, data?: LogData) => void;
} = {
  info: (prefix, message, data) => log(LogLevel.INFO, prefix, message, data),
  warn: (prefix, message, data) => log(LogLevel.WARN, prefix, message, data),
  error: (prefix, message, error) => log(LogLevel.ERROR, prefix, message, error),
  debug: (prefix, message, data) => log(LogLevel.DEBUG, prefix, message, data),
};
