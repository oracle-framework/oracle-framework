import { Tweet, Prompt, DbTweet } from "./types";
import { logger } from "../logger";
import { db } from "../database";

export const saveTweet = (tweet: Tweet): void => {
  try {
    logger.debug({ tweet }, "Inserting tweet");

    if (
      !tweet.idStr ||
      !tweet.userIdStr ||
      !tweet.userScreenName ||
      !tweet.fullText ||
      !tweet.conversationIdStr ||
      !tweet.tweetCreatedAt
    ) {
      throw new Error(
        `Missing required fields for tweet: ${JSON.stringify({
          idStr: !tweet.idStr,
          userIdStr: !tweet.userIdStr,
          userScreenName: !tweet.userScreenName,
          fullText: !tweet.fullText,
          conversationIdStr: !tweet.conversationIdStr,
          tweetCreatedAt: !tweet.tweetCreatedAt,
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
      tweet.idStr,
      tweet.userIdStr,
      tweet.userScreenName,
      tweet.fullText,
      tweet.conversationIdStr,
      tweet.tweetCreatedAt,
      tweet.inReplyToStatusIdStr,
      tweet.inReplyToUserIdStr,
      tweet.inReplyToScreenName,
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

export const savePrompt = (prompt: Prompt): void => {
  try {
    logger.debug({ prompt }, "Inserting prompt");

    if (
      !prompt.twitterHistoryIdStr ||
      !prompt.prompt
    ) {
      throw new Error(
        `Missing required fields for prompt: ${JSON.stringify({
          twitterHistoryIdStr: !prompt.twitterHistoryIdStr,
          prompt: !prompt.prompt,
        })}`,
      );
    }

    const stmt = db.prepare(`
      INSERT INTO prompts (
        twitter_history_id_str,
        prompt
      ) VALUES (?, ?);
    `);

    stmt.run(
      prompt.twitterHistoryIdStr,
      prompt.prompt,
    );

    logger.debug("Successfully inserted prompt");
  } catch (e) {
    logger.error("Error inserting prompt:", e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    throw e;
  }
};

export const getTweetById = (idStr: string): Tweet | undefined => {
  try {
    logger.debug(`Checking for tweet ID: ${idStr}`);

    const stmt = db.prepare(`
      SELECT * FROM twitter_history 
      WHERE id_str = ?
    `);
    const dbTweet = stmt.get(idStr) as DbTweet;

    if (!dbTweet) {
      logger.debug("No tweet found");
      return undefined;
    }

    return {
      idStr: dbTweet.id_str,
      userIdStr: dbTweet.user_id_str,
      userScreenName: dbTweet.user_screen_name,
      fullText: dbTweet.full_text,
      conversationIdStr: dbTweet.conversation_id_str,
      tweetCreatedAt: dbTweet.tweet_created_at,
      inReplyToStatusIdStr: dbTweet.in_reply_to_status_id_str,
      inReplyToUserIdStr: dbTweet.in_reply_to_user_id_str,
      inReplyToScreenName: dbTweet.in_reply_to_screen_name,
    };
  } catch (e) {
    logger.error(`Error getting tweet by input ID ${idStr}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return undefined;
  }
};

export const getTwitterHistory = (
  userIdStr: string,
  limit: number = 50,
  conversationIdStr?: string,
): Tweet[] => {
  try {
    let query = `
      SELECT * FROM twitter_history 
      WHERE user_id_str = ?
    `;
    const params: any[] = [userIdStr];

    if (conversationIdStr) {
      query += ` AND conversation_id_str = ?`;
      params.push(conversationIdStr);
    }

    query += ` ORDER BY tweet_created_at DESC LIMIT ?`;
    params.push(limit);

    const dbTweets = db.prepare(query).all(...params) as DbTweet[];
    return dbTweets.map(dbTweet => ({
      idStr: dbTweet.id_str,
      userIdStr: dbTweet.user_id_str,
      userScreenName: dbTweet.user_screen_name,
      fullText: dbTweet.full_text,
      conversationIdStr: dbTweet.conversation_id_str,
      tweetCreatedAt: dbTweet.tweet_created_at,
      inReplyToStatusIdStr: dbTweet.in_reply_to_status_id_str,
      inReplyToUserIdStr: dbTweet.in_reply_to_user_id_str,
      inReplyToScreenName: dbTweet.in_reply_to_screen_name,
    }));
  } catch (e) {
    logger.error(`Error getting twitter history for user ${userIdStr}:`, e);
    return [];
  }
};

export const getConversationHistory = (
  conversationIdStr: string,
  limit: number = 50,
): Tweet[] => {
  try {
    const dbTweets = db
      .prepare(
        `SELECT * FROM twitter_history WHERE conversation_id_str = ? ORDER BY tweet_created_at DESC LIMIT ?`,
      )
      .all(conversationIdStr, limit) as DbTweet[];

    return dbTweets.map(dbTweet => ({
      idStr: dbTweet.id_str,
      userIdStr: dbTweet.user_id_str,
      userScreenName: dbTweet.user_screen_name,
      fullText: dbTweet.full_text,
      conversationIdStr: dbTweet.conversation_id_str,
      tweetCreatedAt: dbTweet.tweet_created_at,
      inReplyToStatusIdStr: dbTweet.in_reply_to_status_id_str,
      inReplyToUserIdStr: dbTweet.in_reply_to_user_id_str,
      inReplyToScreenName: dbTweet.in_reply_to_screen_name,
    }));
  } catch (e) {
    logger.error(
      `Error getting conversation history for ${conversationIdStr}:`,
      e,
    );
    return [];
  }
};

export const formatTwitterHistoryForPrompt = (history: Tweet[]): string => {
  try {
    return history
      .map(tweet => {
        let text = `@${tweet.userScreenName}: ${tweet.fullText}`;
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
  userIdStr: string,
  interactionTimeout: number,
): number => {
  try {
    const cutoff = new Date(Date.now() - interactionTimeout).toISOString();

    const result = db
      .prepare(
        `
        SELECT COUNT(*) AS interaction_count FROM twitter_history 
        WHERE in_reply_to_user_id_str = ? 
        AND tweet_created_at > ?;
      `,
      )
      .get(userIdStr, cutoff) as {
      interaction_count: number;
    };
    return result.interaction_count || 0;
  } catch (e) {
    logger.error(`Error getting interaction count for user ${userIdStr}:`, e);
    if (e instanceof Error) {
      logger.error("Error stack:", e.stack);
    }
    return 0;
  }
};
