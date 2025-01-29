import Database from "better-sqlite3";
import { initializeSchema } from "./schema";
import { logger } from "../logger";

// Create database connection
const db = new Database("database.db");

try {
  // Set WAL mode for better performance
  db.pragma("journal_mode = WAL");

  // Initialize schema
  initializeSchema(db);
} catch (e) {
  logger.error("Error initializing database:", e);
  if (e instanceof Error) {
    logger.error("Error stack:", e.stack);
  }
  throw e;
}

export { db };
