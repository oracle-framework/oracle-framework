import Database from "better-sqlite3";
import { initializeSchema } from "./schema";
import { logger } from "../logger";
import * as sqliteVec from "sqlite-vec";

// Create database connection
const db = new Database("database.db");
sqliteVec.load(db);

try {
  // Set WAL mode for better performance
  db.pragma("journal_mode = WAL");

  const { sqlite_version, vec_version } = db
    .prepare(
      "select sqlite_version() as sqlite_version, vec_version() as vec_version;",
    )
    .get() as { sqlite_version: string; vec_version: string };

  logger.info(`SQLite version: ${sqlite_version}`);
  logger.info(`Vec version: ${vec_version}`);

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
