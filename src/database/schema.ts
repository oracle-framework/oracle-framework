import { Database } from "better-sqlite3";

export const initializeSchema = (db: Database) => {
  // Check if twitter_history table exists
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='twitter_history'",
    )
    .get();

  if (!tableExists) {
    // Twitter History Table
    db.exec(`
      CREATE TABLE twitter_history (
        twitter_user_id TEXT NOT NULL,
        tweet_id TEXT NOT NULL,
        tweet_text TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        is_bot_tweet INTEGER NOT NULL DEFAULT 0,
        conversation_id TEXT,
        prompt TEXT,
        username TEXT,
        input_tweet_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_twitter_history_user_id ON twitter_history(twitter_user_id);
      CREATE INDEX IF NOT EXISTS idx_twitter_history_conversation ON twitter_history(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_twitter_history_created_at ON twitter_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_twitter_history_tweet_id ON twitter_history(tweet_id);
    `);
  }
};
