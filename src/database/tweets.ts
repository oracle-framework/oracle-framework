import { Tweet } from "../socialmedia/types";
import { saveTwitterHistory, getTwitterHistory } from "./twitter-history";
import { logger } from "../logger";

export const insertTweet = (username: string, tweet: Tweet): void => {
  try {
    logger.debug("Inserting tweet:", { username, tweet });

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
        !tweet.input_tweet_user_id ||
        !tweet.input_tweet_text ||
        !tweet.input_tweet_created_at
      ) {
        throw new Error(
          `Missing required fields for input tweet: ${JSON.stringify({
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
    saveTwitterHistory({
      twitter_user_id: username,
      tweet_id: tweet.new_tweet_id,
      tweet_text: tweet.new_tweet_text,
      created_at: new Date().toISOString(),
      is_bot_tweet: 1,
      conversation_id: tweet.conversation_id,
      prompt: tweet.prompt,
      username: username,
    });

    logger.info("Successfully inserted tweet");
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
    const history = getTwitterHistory(id, 1);
    if (!history.length) return undefined;

    const tweet = history[0];
    return {
      input_tweet_id: tweet.tweet_id,
      input_tweet_created_at: tweet.created_at,
      input_tweet_text: tweet.tweet_text,
      input_tweet_user_id: tweet.twitter_user_id,
      input_tweet_username: tweet.username,
      new_tweet_id: "",
      prompt: tweet.prompt || "",
      new_tweet_text: "",
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
