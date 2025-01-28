import { db } from "./db";
import { logger } from "../logger";

export interface TwitterHistory {
  twitter_user_id: string;
  tweet_id: string;
  tweet_text: string;
  created_at: string;
  is_bot_tweet: number;
  conversation_id?: string;
  prompt?: string;
  username?: string;
}

export const saveTwitterHistory = (history: TwitterHistory) => {
  try {
    logger.debug("Saving twitter history:");

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
        username
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    stmt.run(
      history.twitter_user_id,
      history.tweet_id,
      history.tweet_text,
      history.created_at,
      history.is_bot_tweet,
      history.conversation_id || null,
      history.prompt || null,
      history.username || null,
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
         AND username = ?
         AND is_bot_tweet = 1
         AND created_at >= ?`,
      )
      .get(twitterUserId, botUsername, cutoff) as { interaction_count: number };

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
