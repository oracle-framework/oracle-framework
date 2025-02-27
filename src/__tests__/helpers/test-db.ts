import BetterSqlite3 from "better-sqlite3";
import { Database } from "better-sqlite3";
import { initializeSchema } from "../../database/schema";
import { Tweet } from "../../database/types";
import { logger } from "../../logger";

// Create an in-memory database for testing
export const createTestDb = (): Database => {
  const db = new BetterSqlite3(":memory:");
  initializeSchema(db);
  return db;
};

// Helper methods for common test operations
export const clearTwitterHistory = (db: Database) => {
  db.prepare("DELETE FROM tweets").run();
};

export const getAllTweets = (db: Database): Tweet[] => {
  try {
    const query = "SELECT * FROM tweets";
    return db.prepare(query).all() as Tweet[];
  } catch (e) {
    logger.error("Error getting all tweets:", e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return [];
  }
};

export const getTweetById = (
  db: Database,
  tweetId: string,
): Tweet | undefined => {
  try {
    const query = "SELECT * FROM tweets WHERE id_str = ?";
    return db.prepare(query).get(tweetId) as Tweet | undefined;
  } catch (e) {
    logger.error(`Error getting tweet by ID ${tweetId}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return undefined;
  }
};
