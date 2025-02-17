import { Tweet } from "../socialmedia/types";
import { logger } from "../logger";
import { db } from "../database";

export const saveTweet = (tweet: Tweet): void => {
  try {
    logger.debug({ tweet }, "Inserting tweet");

    if (!tweet.id_str || 
        !tweet.user_id_str || 
        !tweet.user_screen_name || 
        !tweet.full_text || 
        !tweet.conversation_id_str || 
        !tweet.tweet_created_at) {
      throw new Error(
        `Missing required fields for tweet: ${JSON.stringify({
          id_str: !tweet.id_str,
          user_id_str: !tweet.user_id_str,
          user_screen_name: !tweet.user_screen_name,
          full_text: !tweet.full_text,
          conversation_id_str: !tweet.conversation_id_str,
          tweet_created_at: !tweet.tweet_created_at,
        })}`,
      );
    }
    
    const stmt = db.prepare(`
      INSERT INTO twitter_history (
        id_str,
        user_id_str,
        user_screen_name,
        full_text,
        conversation_id_str,
        tweet_created_at,
        in_reply_to_status_id_str,
        in_reply_to_user_id_str,
        in_reply_to_screen_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    stmt.run(
      tweet.id_str,
      tweet.user_id_str,
      tweet.user_screen_name,
      tweet.full_text,
      tweet.conversation_id_str,
      tweet.tweet_created_at,
      tweet.in_reply_to_status_id_str,
      tweet.in_reply_to_user_id_str,
      tweet.in_reply_to_screen_name,
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

export const getTweetById = (id_str: string): Tweet | undefined => {
  try {
    logger.debug(`Checking for tweet ID: ${id_str}`);

    const stmt = db.prepare(`
      SELECT * FROM twitter_history 
      WHERE id_str = ?
      LIMIT 1
    `);
    const tweet = stmt.get(id_str) as Tweet;

    logger.debug({ tweet }, "Query result");

    if (!tweet) {
      logger.debug("No tweet found");
      return undefined;
    }

    return {
      id_str: tweet.id_str,
      user_id_str: tweet.user_id_str,
      user_screen_name: tweet.user_screen_name,
      full_text: tweet.full_text,
      conversation_id_str: tweet.conversation_id_str,
      tweet_created_at: tweet.tweet_created_at,
      in_reply_to_status_id_str: tweet.in_reply_to_status_id_str, 
      in_reply_to_user_id_str: tweet.in_reply_to_user_id_str,
      in_reply_to_screen_name: tweet.in_reply_to_screen_name,
    };
  } catch (e) {
    logger.error(`Error getting tweet by input ID ${id_str}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return undefined;
  }
};

export const getTwitterHistory = (
  user_id_str: string,
  limit: number = 50,
  conversation_id_str?: string,
): Tweet[] => {
  try {
    let query = `
      SELECT * FROM twitter_history 
      WHERE user_id_str = ?
    `;
    const params: any[] = [user_id_str];

    if (conversation_id_str) {
      query += ` AND conversation_id_str = ?`;
      params.push(conversation_id_str);
    }

    query += ` ORDER BY tweet_created_at DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params) as Tweet[];
  } catch (e) {
    logger.error(`Error getting twitter history for user ${user_id_str}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return [];
  }
};

export const getConversationHistory = (
  conversation_id_str: string,
  limit: number = 50,
): Tweet[] => {
  try {
    return db
      .prepare(
        `SELECT * FROM twitter_history WHERE conversation_id_str = ? ORDER BY tweet_created_at DESC LIMIT ?`,
      )
      .all(conversation_id_str, limit) as Tweet[];
  } catch (e) {
    logger.error(
      `Error getting conversation history for ${conversation_id_str}:`,
      e,
    );
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return [];
  }
};

export const formatTwitterHistoryForPrompt = (
  history: Tweet[],
): string => {
  try {
    return history
      .map(tweet => {
        let text = `@${tweet.user_screen_name}: ${tweet.full_text}`;
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


//// note need to look at direct replies in conversation vs mentions in conversation
export const getUserInteractionCount = (
  user_id_str: string,
  interaction_timeout: number,
): number => {
  try {
    const cutoff = new Date(Date.now() - interaction_timeout).toISOString();

    const result = db
      .prepare(`
        SELECT COUNT(*) AS interaction_count FROM twitter_history 
        WHERE in_reply_to_user_id_str = ? 
        AND tweet_created_at > ?;
      `,
      )
      .get(user_id_str, cutoff) as {
      interaction_count: number;
    };

    return result.interaction_count;
  } catch (e) {
    logger.error(
      `Error getting interaction count for user ${user_id_str}:`,
      e,
    );
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return 0;
  }
};
