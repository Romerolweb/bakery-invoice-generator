import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), "src/lib/data/local.db");

// Singleton pattern for DB connection to avoid multiple connections in dev hot-reloads
// eslint-disable-next-line no-var
declare global {
  // eslint-disable-next-line no-var
  var _sqlite: Database.Database | undefined;
}

if (!global._sqlite) {
  global._sqlite = new Database(dbPath);
  global._sqlite.pragma("journal_mode = WAL"); // Better concurrency
}

const sqlite = global._sqlite;

export const db = drizzle(sqlite, { schema });
