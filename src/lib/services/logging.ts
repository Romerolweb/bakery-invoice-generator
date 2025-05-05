// src/lib/services/logging.ts
// REMOVED 'use server'; directive as it's not needed for a server-side utility and causes build errors when exporting an object.

import { type } from 'os';
import { format } from 'date-fns';

type LogData = Record<string, any> | string | number | boolean | Error | undefined;

// Define log levels
enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG', // Optional debug level
}

// Simple logger configuration (can be expanded)
const config = {
  logLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO, // Log debug messages only in development
};

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

    const logMethod = level === LogLevel.ERROR ? console.error
                    : level === LogLevel.WARN ? console.warn
                    : console.log; // INFO and DEBUG use console.log

    if (data) {
        // Check if data is an error object
        if (data instanceof Error) {
            logMethod(logPrefix, message, '\nError:', data); // Print error stack trace nicely
        } else {
             try {
                // Attempt to stringify complex objects for better readability, handle other primitives directly
                const dataString = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
                logMethod(logPrefix, message, '\nData:', dataString);
             } catch (e) {
                 // Fallback if JSON.stringify fails (e.g., circular references)
                 logMethod(logPrefix, message, '\nData:', '[Could not stringify data]', data);
             }
        }
    } else {
        logMethod(logPrefix, message);
    }
}

// Exported logger functions
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

// Example usage within another module:
// import { logger } from '@/lib/services/logging';
// logger.info('MyService', 'Operation started');
// logger.error('MyService', 'Operation failed', errorObject);
