import { db } from "./index";

// Create tables if they don't exist
export const initializeSchema = () => {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tweets (
      twitter_user_name TEXT,
      input_tweet_id TEXT,
      input_tweet_created_at TEXT,
      input_tweet_text TEXT,
      input_tweet_user_id TEXT,
      in_reply_to_status_id TEXT,
      conversation_id TEXT,
      new_tweet_id TEXT,
      prompt TEXT,
      new_tweet_text TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `,
  ).run();
};
