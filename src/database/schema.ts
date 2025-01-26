import { db } from "./index";

// Create tables if they don't exist
export const initializeSchema = () => {
  // Create tweets table
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

  migrateSchema();
};

export const migrateSchema = () => {
  // Check if we need to migrate the chat_messages table
  const tableInfo = db
    .prepare("PRAGMA table_info(chat_messages)")
    .all() as any[];
  const hasMessageType = tableInfo.some(col => col.name === "message_type");

  if (!hasMessageType) {
    // Drop and recreate the table if it exists
    db.prepare("DROP TABLE IF EXISTS chat_messages").run();

    // Create unified chat messages table with new schema
    db.prepare(
      `
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
        is_bot_response INTEGER NOT NULL,
        prompt TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, platform_message_id)
      );
    `,
    ).run();

    // Create index for efficient querying
    db.prepare(
      `
      CREATE INDEX IF NOT EXISTS idx_platform_date 
      ON chat_messages(platform, created_at DESC);
    `,
    ).run();
  }
};
