import { Database } from "better-sqlite3";

export const initializeSchema = (db: Database) => {
  // Check if twitter_history table exists
  const tweetsTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tweets'",
    )
    .get();

  if (!tweetsTableExists) {
    // Tweets Table
    db.exec(`
      CREATE TABLE tweets (
        id_str VARCHAR(50) NOT NULL,              
        user_id_str VARCHAR(50) NOT NULL,         
        user_screen_name VARCHAR(20) NOT NULL,    
        full_text TEXT NOT NULL,                  
        conversation_id_str VARCHAR(50) NOT NULL, 
        tweet_created_at DATETIME NOT NULL,
        in_reply_to_status_id_str VARCHAR(50),    
        in_reply_to_user_id_str VARCHAR(50),      
        in_reply_to_screen_name VARCHAR(20)       
      );

      CREATE INDEX IF NOT EXISTS idx_tweets_id_str ON tweets(id_str);
      CREATE INDEX IF NOT EXISTS idx_tweets_user_id_str ON tweets(user_id_str);
      CREATE INDEX IF NOT EXISTS idx_tweets_conversation_id_str ON tweets(conversation_id_str);
      CREATE INDEX IF NOT EXISTS idx_tweets_tweet_created_at ON tweets(tweet_created_at);
      CREATE INDEX IF NOT EXISTS idx_tweets_in_reply_to_status_id_str ON tweets(in_reply_to_status_id_str);
      CREATE INDEX IF NOT EXISTS idx_tweets_in_reply_to_user_id_str ON tweets(in_reply_to_user_id_str);
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

  // Check if vector_tweets table exists
  const vectorTweetsTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='vector_tweets'",
    )
    .get();

  if (!vectorTweetsTableExists) {
    // Vector Tweets Table
    db.exec(`
      CREATE VIRTUAL TABLE vector_tweets USING vec0(
        username TEXT,
        tweet_id text,
        tweet_text text,
        tweet_text_summary text,
        tweeted_at text,
        tweet_text_embedding float[384],
        tweet_text_summary_embedding float[384]
      );
    `);
  }

  // Check if promptstable exists
  const promptsTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'",
    )
    .get();

  if (!promptsTableExists) {
    // Prompts Table
    db.exec(`
      CREATE TABLE prompts (
        tweet_id_str VARCHAR(50) NOT NULL,              
        prompt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_prompts_tweet_id_str ON prompts(tweet_id_str);
    `);
  }
};
