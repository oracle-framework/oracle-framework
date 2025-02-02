import BetterSqlite3 from "better-sqlite3";
import { Database } from "better-sqlite3";
import { initializeSchema } from "../../database/schema";
import { TwitterHistory } from "../../database/tweets";
import { logger } from "../../logger";

// Create an in-memory database for testing
export const createTestDb = (): Database => {
  const db = new BetterSqlite3(":memory:");
  initializeSchema(db);
  return db;
};

// Helper methods for common test operations
export const clearTwitterHistory = (db: Database) => {
  db.prepare("DELETE FROM twitter_history").run();
};

export const getAllTweets = (db: Database): TwitterHistory[] => {
  try {
    const query = "SELECT * FROM twitter_history";
    return db.prepare(query).all() as TwitterHistory[];
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
): TwitterHistory | undefined => {
  try {
    const query = "SELECT * FROM twitter_history WHERE tweet_id = ?";
    return db.prepare(query).get(tweetId) as TwitterHistory | undefined;
  } catch (e) {
    logger.error(`Error getting tweet by ID ${tweetId}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return undefined;
  }
};
