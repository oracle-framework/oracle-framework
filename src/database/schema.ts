import { Database } from "better-sqlite3";

// Create tables if they don't exist
export const initializeSchema = (db: Database) => {
  // Twitter History Table
  db.exec(`
    DROP TABLE IF EXISTS twitter_history;
    
    CREATE TABLE twitter_history (
      twitter_user_id TEXT NOT NULL,
      tweet_id TEXT NOT NULL,
      tweet_text TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      is_bot_tweet INTEGER NOT NULL DEFAULT 0,
      conversation_id TEXT,
      prompt TEXT,
      username TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_twitter_history_user_id ON twitter_history(twitter_user_id);
    CREATE INDEX IF NOT EXISTS idx_twitter_history_conversation ON twitter_history(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_twitter_history_created_at ON twitter_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_twitter_history_tweet_id ON twitter_history(tweet_id);
  `);

  migrateTweetsToHistory(db);
  migrateSchema(db);
};

// Migration function to move data from tweets to twitter_history
function migrateTweetsToHistory(db: Database) {
  // Check if tweets table exists
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tweets'",
    )
    .get();
  if (!tableExists) return;

  // Migrate existing tweets to twitter_history
  db.exec(`
    INSERT OR IGNORE INTO twitter_history (
      twitter_user_id,
      tweet_id,
      tweet_text,
      created_at,
      is_bot_tweet,
      conversation_id,
      prompt,
      username
    )
    SELECT 
      input_tweet_user_id,
      input_tweet_id,
      input_tweet_text,
      input_tweet_created_at,
      0,
      conversation_id,
      prompt,
      NULL
    FROM tweets
    WHERE input_tweet_id IS NOT NULL;
  `);

  db.exec(`
    INSERT OR IGNORE INTO twitter_history (
      twitter_user_id,
      tweet_id,
      tweet_text,
      created_at,
      is_bot_tweet,
      conversation_id,
      prompt,
      username
    )
    SELECT 
      twitter_user_name,
      new_tweet_id,
      new_tweet_text,
      created_at,
      1,
      conversation_id,
      prompt,
      NULL
    FROM tweets
    WHERE new_tweet_id IS NOT NULL;
  `);

  // Drop the tweets table after migration
  db.exec("DROP TABLE IF EXISTS tweets");
}

export const migrateSchema = (db: Database) => {
  // Check if we need to migrate the chat_messages table
  const tableInfo = db
    .prepare("PRAGMA table_info(chat_messages)")
    .all() as any[];
  const hasMessageType = tableInfo.some(col => col.name === "message_type");

  if (!hasMessageType) {
    // Drop and recreate the table if it exists
    db.exec(`
      DROP TABLE IF EXISTS chat_messages;

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
      CREATE INDEX idx_chat_messages_platform_channel ON chat_messages(platform, platform_channel_id);
      CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);
    `);
  }

  // Check if twitter_history needs the input_tweet_id column
  const twitterHistoryInfo = db
    .prepare("PRAGMA table_info(twitter_history)")
    .all() as any[];
  const hasInputTweetId = twitterHistoryInfo.some(col => col.name === "input_tweet_id");

  if (!hasInputTweetId) {
    db.exec(`
      ALTER TABLE twitter_history 
      ADD COLUMN input_tweet_id TEXT;
    `);
    
    // Update existing records to set input_tweet_id based on conversation_id
    db.exec(`
      UPDATE twitter_history
      SET input_tweet_id = conversation_id
      WHERE is_bot_tweet = 1 AND input_tweet_id IS NULL;
    `);
  }
};
