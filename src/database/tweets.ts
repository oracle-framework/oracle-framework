import { Tweet } from "../socialmedia/types";
import { logger } from "../logger";
import { db } from "../database";

export const saveTweet = (username: string, tweet: Tweet): void => {
  try {
    logger.debug({ username, tweet }, "Inserting tweet");

    if (!username || !tweet.new_tweet_id || !tweet.new_tweet_text) {
      throw new Error(
        `Missing required fields for bot tweet: ${JSON.stringify({
          username: !username,
          new_tweet_id: !tweet.new_tweet_id,
          new_tweet_text: !tweet.new_tweet_text,
        })}`,
      );
    }

    if (tweet.input_tweet_id) {
      if (
        !tweet.input_tweet_username ||
        !tweet.input_tweet_user_id ||
        !tweet.input_tweet_text ||
        !tweet.input_tweet_created_at
      ) {
        throw new Error(
          `Missing required fields for input tweet: ${JSON.stringify({
            input_tweet_username: !tweet.input_tweet_username,
            input_tweet_user_id: !tweet.input_tweet_user_id,
            input_tweet_text: !tweet.input_tweet_text,
            input_tweet_created_at: !tweet.input_tweet_created_at,
          })}`,
        );
      }

      // Save the original tweet
      saveTwitterHistory({
        twitter_user_id: tweet.input_tweet_user_id,
        tweet_id: tweet.input_tweet_id,
        tweet_text: tweet.input_tweet_text,
        created_at: tweet.input_tweet_created_at,
        is_bot_tweet: 0,
        conversation_id: tweet.conversation_id,
        username: tweet.input_tweet_username,
      });
    }

    // Save the bot's reply
    const stmt = db.prepare(`
      INSERT INTO twitter_history (
        twitter_user_id,
        tweet_id,
        tweet_text,
        created_at,
        is_bot_tweet,
        conversation_id,
        prompt,
        username,
        input_tweet_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      username,
      tweet.new_tweet_id,
      tweet.new_tweet_text,
      new Date().toISOString(),
      1,
      tweet.conversation_id,
      tweet.prompt,
      username,
      tweet.input_tweet_id,
    );

    logger.debug("Successfully inserted tweet");
  } catch (e) {
    logger.error("Error inserting tweet:", e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    throw e;
  }
};

export const getTweetByInputTweetId = (id: string): Tweet | undefined => {
  try {
    logger.debug(`Checking for tweet ID: ${id}`);

    const stmt = db.prepare(`
      SELECT * FROM twitter_history 
      WHERE input_tweet_id = ?
      LIMIT 1
    `);
    const tweet = stmt.get(id) as TwitterHistory;

    logger.debug({ tweet }, "Query result");

    if (!tweet) {
      logger.debug("No tweet found");
      return undefined;
    }

    return {
      input_tweet_id: tweet.input_tweet_id || tweet.tweet_id,
      input_tweet_created_at: tweet.created_at,
      input_tweet_text: tweet.tweet_text,
      input_tweet_user_id: tweet.twitter_user_id,
      input_tweet_username: tweet.username,
      new_tweet_id: tweet.tweet_id,
      prompt: tweet.prompt || "",
      new_tweet_text: tweet.tweet_text,
      conversation_id: tweet.conversation_id,
    };
  } catch (e) {
    logger.error(`Error getting tweet by input ID ${id}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return undefined;
  }
};

export const getLastTweetByUsername = (username: string): Tweet | undefined => {
  try {
    const history = getTwitterHistory(username, 1);
    if (!history.length) return undefined;

    const tweet = history[0];
    return {
      input_tweet_id: "",
      input_tweet_created_at: "",
      input_tweet_text: "",
      input_tweet_user_id: "",
      new_tweet_id: tweet.tweet_id,
      prompt: tweet.prompt || "",
      new_tweet_text: tweet.tweet_text,
      conversation_id: tweet.conversation_id,
    };
  } catch (e) {
    logger.error(`Error getting last tweet for user ${username}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return undefined;
  }
};

export interface TwitterHistory {
  twitter_user_id: string;
  tweet_id: string;
  tweet_text: string;
  created_at: string;
  is_bot_tweet: number;
  conversation_id?: string;
  prompt?: string;
  username?: string;
  input_tweet_id?: string;
}

export const saveTwitterHistory = (history: TwitterHistory) => {
  try {
    logger.debug("Saving twitter history");

    // Validate required fields
    if (
      !history.twitter_user_id ||
      !history.tweet_id ||
      !history.tweet_text ||
      !history.created_at
    ) {
      throw new Error(
        `Missing required fields: ${JSON.stringify({
          twitter_user_id: !history.twitter_user_id,
          tweet_id: !history.tweet_id,
          tweet_text: !history.tweet_text,
          created_at: !history.created_at,
        })}`,
      );
    }

    const stmt = db.prepare(`
      INSERT INTO twitter_history (
        twitter_user_id,
        tweet_id,
        tweet_text,
        created_at,
        is_bot_tweet,
        conversation_id,
        prompt,
        username,
        input_tweet_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    stmt.run(
      history.twitter_user_id,
      history.tweet_id,
      history.tweet_text,
      history.created_at,
      history.is_bot_tweet,
      history.conversation_id || null,
      history.prompt || null,
      history.username || null,
      history.input_tweet_id || null,
    );

    logger.debug("Successfully saved twitter history");
  } catch (e) {
    logger.error(
      "Error saving twitter history:",
      e instanceof Error ? e.message : e,
    );
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    throw e;
  }
};

export const getTwitterHistory = (
  userId: string,
  limit: number = 50,
  conversationId?: string,
): TwitterHistory[] => {
  try {
    let query = `
      SELECT * FROM twitter_history 
      WHERE twitter_user_id = ?
    `;
    const params: any[] = [userId];

    if (conversationId) {
      query += ` AND conversation_id = ?`;
      params.push(conversationId);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params) as TwitterHistory[];
  } catch (e) {
    logger.error(`Error getting twitter history for user ${userId}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return [];
  }
};

export const getTwitterHistoryByUsername = (
  username: string,
  limit: number = 50,
): TwitterHistory[] => {
  try {
    return db
      .prepare(
        `SELECT * FROM twitter_history WHERE username = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(username, limit) as TwitterHistory[];
  } catch (e) {
    logger.error(`Error getting twitter history for user ${username}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return [];
  }
};

export const getConversationHistory = (
  conversationId: string,
  limit: number = 50,
): TwitterHistory[] => {
  try {
    return db
      .prepare(
        `SELECT * FROM twitter_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(conversationId, limit) as TwitterHistory[];
  } catch (e) {
    logger.error(
      `Error getting conversation history for ${conversationId}:`,
      e,
    );
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return [];
  }
};

export const formatTwitterHistoryForPrompt = (
  history: TwitterHistory[],
  includePrompts: boolean = false,
): string => {
  try {
    return history
      .map(tweet => {
        let text = `@${tweet.username}: ${tweet.tweet_text}`;
        if (includePrompts && tweet.prompt) {
          text += `\nPrompt used: ${tweet.prompt}`;
        }
        return text;
      })
      .join("\n\n");
  } catch (e) {
    logger.error("Error formatting twitter history:", e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return "";
  }
};

export const getUserInteractionCount = (
  twitterUserId: string,
  botUsername: string,
  interactionTimeout: number,
): number => {
  try {
    const cutoff = new Date(Date.now() - interactionTimeout).toISOString();

    const result = db
      .prepare(
        `SELECT COUNT(*) as interaction_count 
         FROM twitter_history 
         WHERE twitter_user_id = ? 
         AND is_bot_tweet = 1
         AND created_at >= ?
         AND (
           -- Count when we reply to this user
           (username = ?) OR
           -- Count when this user is in the conversation
           (conversation_id IN (
             SELECT conversation_id 
             FROM twitter_history 
             WHERE twitter_user_id = ?
             AND conversation_id IS NOT NULL
           ))
         )`,
      )
      .get(botUsername, cutoff, twitterUserId, twitterUserId) as {
      interaction_count: number;
    };

    return result.interaction_count;
  } catch (e) {
    logger.error(
      `Error getting interaction count for user ${twitterUserId}:`,
      e,
    );
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return 0;
  }
};
