import { Database } from "better-sqlite3";

export const initializeSchema = (db: Database) => {
  // Check if twitter_history table exists
  const twitterTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='twitter_history'",
    )
    .get();

  if (!twitterTableExists) {
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

  // Check if chat_messages table exists
  const chatMessagesTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'",
    )
    .get();

  if (!chatMessagesTableExists) {
    // Chat Messages Table
    db.exec(`
      CREATE TABLE chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        platform_channel_id TEXT,
        platform_message_id TEXT,
        platform_user_id TEXT,
        username TEXT,
        session_id TEXT,
        message_content TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        metadata TEXT,
        is_bot_response INTEGER NOT NULL DEFAULT 0,
        prompt TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_chat_messages_platform ON chat_messages(platform);
      CREATE INDEX idx_chat_messages_platform_channel ON chat_messages(platform_channel_id);
      CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
    `);
  }
};
