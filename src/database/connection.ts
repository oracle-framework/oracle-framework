import { Database } from "bun:sqlite";

// Database connection singleton
export const db = new Database("database.db");

// Set WAL mode
db.run("PRAGMA journal_mode = WAL");
