// src/lib/services/logging.ts
import { format } from "date-fns";
// Removed direct import: import fs from 'fs';
import path from "path";

type LogData =
  | Record<string, unknown>
  | string
  | number
  | boolean
  | Error
  | undefined;

// Define log levels
enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

// Logger configuration
const config = {
  logLevel:
    process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO,
  logToFile: true, // Enable file logging (server-side only)
  logFilePath: path.join(process.cwd(), "logs", "app.log"), // Path to the log file
  logLevelsToFile: [LogLevel.ERROR, LogLevel.WARN], // Log only errors and warnings to file by default
};

const logDirectory = path.dirname(config.logFilePath);

// Ensure log directory exists synchronously on first log attempt if needed (server-side only)
let logDirectoryEnsured = false;
async function ensureLogDirectoryExists() {
  if (logDirectoryEnsured || typeof window !== "undefined") return; // Only run on server

  try {
    // Dynamically import 'fs' only when needed on the server
    const fs = await import("fs");
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
      console.log(`[Logger] Created log directory: ${logDirectory}`);
    }
    logDirectoryEnsured = true;
  } catch (error) {
    console.error("[Logger] FATAL: Error creating log directory", error);
    config.logToFile = false; // Disable file logging if directory creation fails
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
async function log(
  level: LogLevel,
  prefix: string,
  message: string,
  data?: LogData,
): Promise<void> {
  if (!isLevelEnabled(level)) {
    return;
  }

  const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss.SSS");
  const logPrefix = `[${timestamp}] [${level}]${prefix ? ` [${prefix}]` : ""}:`;

  // --- Console Logging (works on server and client) ---
  const consoleLogMethod =
    level === LogLevel.ERROR
      ? console.error
      : level === LogLevel.WARN
        ? console.warn
        : console.log; // INFO and DEBUG use console.log

  let dataStringForConsole = "";
  if (data) {
    if (data instanceof Error) {
      dataStringForConsole = `\nError: ${data.stack || data.message}`;
    } else {
      try {
        dataStringForConsole = `
Data: ${typeof data === "object" ? JSON.stringify(data, null, 2) : data}`;
      } catch {
        dataStringForConsole = `
Data: [Could not stringify data]`;
      }
    }
  }
  consoleLogMethod(`${logPrefix} ${message}${dataStringForConsole}`);

  // --- File Logging (Server-Side Only) ---
  if (
    typeof window === "undefined" &&
    config.logToFile &&
    config.logLevelsToFile.includes(level)
  ) {
    await ensureLogDirectoryExists();
    if (!config.logToFile) return; // Check again in case ensure failed

    let dataStringForFile = "";
    if (data) {
      if (data instanceof Error) {
        dataStringForFile = `\nError: ${data.stack || data.message}`;
      } else {
        try {
          dataStringForFile = ` | Data: ${typeof data === "object" ? JSON.stringify(data) : data}`;
        } catch {
          dataStringForFile = " | Data: [Could not stringify data]";
        }
      }
    }

    const fileLogMessage = `${logPrefix} ${message}${dataStringForFile}\n`;

    try {
      // Dynamically import 'fs' for server-side use
      const fs = await import("fs");
      fs.appendFile(config.logFilePath, fileLogMessage, (err) => {
        if (err) {
          console.error("[Logger] Error writing to log file:", err);
        }
      });
    } catch (fsError) {
      console.error(
        "[Logger] Error importing or using fs for file logging:",
        fsError,
      );
      config.logToFile = false; // Disable further file logging attempts if fs fails
    }
  }
}

// Exported logger functions interface remains the same
// Note: These now return Promise<void> because log is async, but callers don't necessarily need to await.
export const logger: {
  info: (prefix: string, message: string, data?: LogData) => Promise<void>;
  warn: (prefix: string, message: string, data?: LogData) => Promise<void>;
  error: (prefix: string, message: string, error?: LogData) => Promise<void>;
  debug: (prefix: string, message: string, data?: LogData) => Promise<void>;
} = {
  info: (prefix: string, message: string, data?: LogData) => log(LogLevel.INFO, prefix, message, data),
  warn: (prefix: string, message: string, data?: LogData) => log(LogLevel.WARN, prefix, message, data),
  error: (prefix: string, message: string, error?: LogData) =>
    log(
      LogLevel.ERROR,
      prefix,
      message,
      error instanceof Error ? error : error !== undefined ? new Error(String(error)) : undefined
    ),
  debug: (prefix: string, message: string, data?: LogData) => log(LogLevel.DEBUG, prefix, message, data),
};
