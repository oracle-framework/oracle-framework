import Database from "better-sqlite3";

import { initializeSchema } from "./schema";

// Re-export types and functions
export * from "./types";
export * from "./tweets";

// Database connection singleton
export const db = new Database("database.db");

// Set WAL mode
db.pragma("journal_mode = WAL");

// Initialize database schema
initializeSchema();
