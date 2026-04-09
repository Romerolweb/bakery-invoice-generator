import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgres://localhost:5432/bakery";

// Singleton pattern for DB connection to avoid multiple connections in dev hot-reloads
// eslint-disable-next-line no-var
declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

if (!global._pgClient) {
  global._pgClient = postgres(connectionString);
}

const client = global._pgClient;

export const db = drizzle(client, { schema });
