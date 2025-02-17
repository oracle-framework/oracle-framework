import * as fs from "fs";
import { Scraper, SearchMode } from "goat-x";

import { Character } from "../characters";
import {
  generateImagePromptForCharacter,
  generateReply,
  generateTopicPost,
  handleBannedAndLengthRetries,
} from "../completions";
import { saveTweet as saveTweet, getTweetById } from "../database";
import { generateImageForTweet } from "../images";
import { logger } from "../logger";
import { randomInterval } from "../utils";
import { Tweet, TwitterCreateTweetResponse } from "./types";
import {
  formatTwitterHistoryForPrompt,
  getConversationHistory,
  getTwitterHistory,
  getUserInteractionCount,
} from "../database/tweets";

interface Mention {
  id_str: string;
  username: string;
  tweet_created_at: string;
  full_text: string;
  user_id_str: string;
  conversation_id: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  in_reply_to_screen_name?: string;
}


export class TwitterProvider {
  private scraper: Scraper;
  private character: Character;

  constructor(character: Character) {
    this.character = character;
    this.scraper = new Scraper();
  }

  public async login() {
    await this.scraper.login(
      this.character.username,
      this.character.twitterPassword,
      this.character.twitterEmail ? this.character.twitterEmail : undefined,
    );
    const cookies = await this.scraper.getCookies();
    fs.writeFileSync(
      `cookies/cookies_${this.character.username}.json`,
      JSON.stringify(cookies, null, 2),
    );
    logger.info(`Successfully wrote cookies for ${this.character.username}`);
  }

  public async initWithCookies() {
    const cookiesText = fs.readFileSync(
      `./cookies/cookies_${this.character.username}.json`,
      "utf8",
    );
    const cookiesArray = JSON.parse(cookiesText);
    const cookieStrings = cookiesArray?.map(
      (cookie: any) =>
        `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${
          cookie.path
        }; ${cookie.secure ? "Secure" : ""}; ${
          cookie.httpOnly ? "HttpOnly" : ""
        }; SameSite=${cookie.sameSite || "Lax"}`,
    );
    await this.scraper.setCookies(cookieStrings);
    this.character.user_id_str = await this.getUserId(this.character.username); //// need to find a good spot for this
    return this;
  }

  public async startTopicPosts() {
    const defaultBound = 30;
    const {
      topicInterval = 45 * 60 * 1000, // 45 minutes default
      lowerBoundPostingInterval = defaultBound,
      upperBoundPostingInterval = defaultBound,
    } = this.character.postingBehavior;

    const lowerBound = topicInterval - lowerBoundPostingInterval * 60 * 1000;
    const upperBound = topicInterval + upperBoundPostingInterval * 60 * 1000;

    try {
      await this.generateTimelinePost();
      randomInterval(() => this.generateTimelinePost(), lowerBound, upperBound);
    } catch (error: unknown) {
      logger.error("Error writing topic post:", error);
    }
  }

  public async startAutoResponder() {
    const defaultBound = 60;
    const lowerBound =
      this.character.postingBehavior.replyInterval ||
      15 * 60 * 1000 - // 15 minutes default
        (this.character.postingBehavior.lowerBoundPostingInterval ||
          defaultBound) *
          60 *
          1000;
    const upperBound =
      this.character.postingBehavior.replyInterval ||
      15 * 60 * 1000 +
        (this.character.postingBehavior.upperBoundPostingInterval ||
          defaultBound) *
          60 *
          1000;

    await this.generateTimelineResponse();
    randomInterval(
      async () => await this.generateTimelineResponse(),
      lowerBound,
      upperBound,
    );
  }

  public async startReplyingToMentions() {
    const defaultBound = 2;
    const lowerBound =
      10 * 60 * 1000 - // 10 minutes default
      (this.character.postingBehavior.lowerBoundPostingInterval ||
        defaultBound) *
        60 *
        1000;
    const upperBound =
      10 * 60 * 1000 +
      (this.character.postingBehavior.upperBoundPostingInterval ||
        defaultBound) *
        60 *
        1000;

    await this.replyToMentions();
    randomInterval(
      async () => await this.replyToMentions(),
      lowerBound,
      upperBound,
    );
  }

  private async generateTimelinePost() {
    logger.info(
      `Calling generateTimelinePost for ${this.character.username} at ${new Date().toLocaleString()}`,
    );

    try {
      /// needs to take user_id_str
      const botHistory = await getTwitterHistory(
        this.character.username,
      );
      const formattedHistory = formatTwitterHistoryForPrompt(botHistory);

      const completion = await generateTopicPost(
        this.character,
        formattedHistory,
      );
      logger.info("LLM completion done.");

      let sendTweetResponse;

      const shouldGenerateImage =
        this.character.postingBehavior.generateImagePrompt &&
        Math.random() <
          (this.character.postingBehavior.imagePromptChance || 0.3);

      logger.debug(`shouldGenerateImage: ${shouldGenerateImage}`);

      if (shouldGenerateImage) {
        try {
          const imageBuffer =
            await this.generateImageForTwitterPost(completion);
          sendTweetResponse = await this.sendTweetWithMedia(
            completion.reply,
            imageBuffer,
          );
        } catch (e) {
          logger.error("Error sending tweet with image:", e);
          // Fallback to sending tweet without image
          logger.info("Falling back to sending tweet without image");
          sendTweetResponse = await this.scraper.sendTweet(completion.reply);
        }
      } else {
        sendTweetResponse = await this.scraper.sendTweet(completion.reply);
      }

      if (!sendTweetResponse) {
        throw new Error("Failed to send tweet - no response received");
      }

      const responseJson =
        (await sendTweetResponse.json()) as TwitterCreateTweetResponse;
      if (!responseJson.data?.create_tweet) {
        logger.error("An error occurred:", { responseJson });
        return;
      }

      const newTweetId =
        responseJson.data.create_tweet.tweet_results.result.rest_id;
      logger.info(`The reply tweet was sent: ${newTweetId}`);

      const tweet: Tweet = {
        id_str: responseJson.data.create_tweet.tweet_results.result.rest_id,
        user_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.user_id_str,
        tweet_created_at: responseJson.data.create_tweet.tweet_results.result.legacy.created_at,
        full_text: responseJson.data.create_tweet.tweet_results.result.legacy.full_text,
        user_screen_name: responseJson.data.create_tweet.tweet_results.result.core.user_results.result.legacy.screen_name,
        conversation_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.conversation_id_str,
        in_reply_to_status_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_status_id_str,
        in_reply_to_user_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_user_id_str,
        in_reply_to_screen_name: responseJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_screen_name
      };

      saveTweet(tweet);
      logger.info("A row was inserted into the database.\n");
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  private async generateTimelineResponse() {
    logger.info(
      `Calling generateTimelineResponse for ${this.character.username} at ${new Date().toLocaleString()}***`,
    );

    try {
      const timeline = await this.getTimeline();
      const filteredTimeline = this.filterTimeline(timeline);
      logger.info(`After filtering, ${filteredTimeline.length} posts remain.`);
      const mostRecentTweet = filteredTimeline.reduce((latest, current) => {
        return new Date(current.tweet_created_at) > new Date(latest.tweet_created_at)
          ? current
          : latest;
      }, filteredTimeline[0]);

      if (!mostRecentTweet) {
        logger.error("No most recent tweet found");
        return;
      }

      const mostRecentTweetMinutesAgo = Math.round(
        (Date.now() - new Date(mostRecentTweet.tweet_created_at).getTime()) / 1000 / 60,
      );
      logger.info(
        `The most recent tweet was ${mostRecentTweetMinutesAgo} minutes ago.`,
      );

      const history = getTwitterHistory(this.character.user_id_str, 10);
      const historyByUser = getTwitterHistory(mostRecentTweet.user_id_str, 10);

      const formattedHistory = formatTwitterHistoryForPrompt(
        history.concat(historyByUser),
      );

      const completion = await generateReply(
        mostRecentTweet.full_text,
        this.character,
        false,
        formattedHistory,
      );

      logger.info("LLM completion done.");

      const sendTweetResponse = await this.scraper.sendTweet(
        completion.reply,
        mostRecentTweet.id_str,
      );

      const newTweetJson =
        (await sendTweetResponse.json()) as TwitterCreateTweetResponse;

      if (!newTweetJson.data?.create_tweet) {
        logger.error("An error occurred:", { responseJson: newTweetJson });
        return;
      }
      // save in_reply_to tweet
      saveTweet({
        id_str: mostRecentTweet.id_str,
        user_id_str: mostRecentTweet.user_id_str,
        tweet_created_at: mostRecentTweet.tweet_created_at,
        full_text: mostRecentTweet.full_text,
        user_screen_name: mostRecentTweet.user_screen_name,
        conversation_id_str: mostRecentTweet.conversation_id_str,
        in_reply_to_status_id_str: mostRecentTweet.in_reply_to_status_id_str || "",
        in_reply_to_user_id_str: mostRecentTweet.in_reply_to_user_id_str || "",
        in_reply_to_screen_name: mostRecentTweet.in_reply_to_screen_name || "",
      });
      // save reply tweet
      saveTweet({
        id_str: newTweetJson.data.create_tweet.tweet_results.result.rest_id,
        user_id_str: newTweetJson.data.create_tweet.tweet_results.result.legacy.user_id_str,
        tweet_created_at: new Date(newTweetJson.data.create_tweet.tweet_results.result.legacy.created_at).toISOString(),
        full_text: newTweetJson.data.create_tweet.tweet_results.result.legacy.full_text,
        user_screen_name: newTweetJson.data.create_tweet.tweet_results.result.core.user_results.result.legacy.screen_name,
        conversation_id_str: newTweetJson.data.create_tweet.tweet_results.result.legacy.conversation_id_str,
        in_reply_to_status_id_str: newTweetJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_status_id_str,
        in_reply_to_user_id_str: newTweetJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_user_id_str,
        in_reply_to_screen_name: newTweetJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_screen_name,
      });
      logger.info(mostRecentTweet);
      
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  private filterTimeline(timeline: Tweet[]) {
    return timeline
      .filter(
        x =>
          !x.full_text.includes("http") &&
          !this.character.postingBehavior.dontTweetAt?.includes(x.user_id_str),
      )
      .filter(x => getTweetById(x.id_str) === undefined)
      .filter(x => {
        const interactionCount = getUserInteractionCount(
          x.user_id_str,
          this.INTERACTION_TIMEOUT,
        );
        return interactionCount < this.INTERACTION_LIMIT;
      });
  }

  private async replyToMentions() {
    logger.info("Running replyToMentions", new Date().toISOString());
    try {
      const mentions = await this.findMentions(10);
      console.log(mentions);
      logger.info(`Found ${mentions.length} mentions`);

      for (const mention of mentions) {
        try {
          if (!mention.full_text || !mention.id_str) {
            logger.info(`Skipping mention ${mention.id_str}: No text or ID`);
            continue;
          }

          const shouldSkip = await this.shouldSkipMention(mention);
          if (shouldSkip) {
            logger.info(
              `Skipping mention ${mention.id_str}: Already processed or too many interactions`,
            );
            continue;
          }

          logger.info(
            `Processing new mention ${mention.id_str} from ${mention.username}: ${mention.full_text}`,
          );

          logger.info("Waiting 15 seconds before replying");
          await new Promise(resolve => setTimeout(resolve, 15000)); // Default delay
          const history = this.getTwitterHistoryByMention(mention);
          const formattedHistory = formatTwitterHistoryForPrompt(
            history,
          );

          const completion = await generateReply(
            mention.full_text,
            this.character,
            false,
            formattedHistory,
          );

          logger.info(`Generated reply for ${mention.id_str}: ${completion.reply}`);

          const sendTweetResponse = await this.scraper.sendTweet(
            completion.reply,
            mention.id_str,
          );

          const responseJson =
            (await sendTweetResponse.json()) as TwitterCreateTweetResponse;
          if (!responseJson.data?.create_tweet) {
            logger.error("Failed to send tweet:", { responseJson });
            continue;
          }

          const newTweetId =
            responseJson.data.create_tweet.tweet_results.result.rest_id;

          logger.info(`The reply tweet was sent: ${newTweetId}`);

          //save mention
          saveTweet({
            id_str: mention.id_str,
            user_id_str: mention.user_id_str,
            tweet_created_at: mention.tweet_created_at,
            full_text: mention.full_text,
            user_screen_name: mention.username,
            conversation_id_str: mention.conversation_id,
            in_reply_to_status_id_str: mention.in_reply_to_status_id_str,
            in_reply_to_user_id_str: mention.in_reply_to_user_id_str,
            in_reply_to_screen_name: mention.in_reply_to_screen_name,
          });
          //save reply tweet
          saveTweet({
            id_str: newTweetId,
            user_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.user_id_str,
            tweet_created_at: new Date(responseJson.data.create_tweet.tweet_results.result.legacy.created_at).toISOString(),
            full_text: responseJson.data.create_tweet.tweet_results.result.legacy.full_text,
            user_screen_name: responseJson.data.create_tweet.tweet_results.result.core.user_results.result.legacy.screen_name,
            conversation_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.conversation_id_str,
            in_reply_to_status_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_status_id_str,
            in_reply_to_user_id_str: responseJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_user_id_str,
            in_reply_to_screen_name: responseJson.data.create_tweet.tweet_results.result.legacy.in_reply_to_screen_name,
          });
        } catch (e) {
          logger.error(`Error processing mention ${mention.id_str}:`, e);
          if (e instanceof Error) {
            logger.error("Error stack:", e.stack);
          }
          // Log the mention that failed
          logger.error("Failed mention:", JSON.stringify(mention, null, 2));
        }
      }
    } catch (e) {
      logger.error("Error in replyToMentions:", e);
      if (e instanceof Error) {
        logger.error("Error stack:", e.stack);
      }
    }
    logger.info("Finished replyToMentions", new Date().toISOString());
  }

  private getTwitterHistoryByMention(mention: Mention): Tweet[] {
    let history: Tweet[] = [];
    history.push(...getTwitterHistory(mention.user_id_str, 10));
    if (mention.conversation_id) {
      history.push(...getConversationHistory(mention.conversation_id, 10));
    }
    return history;
  }

  private async shouldSkipMention(mention: Mention) {
    try {
      if (!mention.id_str || !mention.user_id_str) {
        logger.info(`Skipping mention: Missing ID or user_id_str`);
        return true;
      }

      // Skip if we've already processed this tweet
      const existingTweet = getTweetById(mention.id_str);
      if (existingTweet) {
        logger.info(`Skipping mention ${mention.id_str}: Already processed`);
        return true;
      }

      // Get interaction count from twitter_history
      const interactionCount = getUserInteractionCount(
        mention.user_id_str,
        this.INTERACTION_TIMEOUT,
      );

      if (interactionCount > this.INTERACTION_LIMIT) {
        logger.info(
          `Skipping mention ${mention.id_str}: Too many interactions (${interactionCount}) with user ${mention.user_id_str}`,
        );
        return true;
      }

      // Skip if user is in dontTweetAt list
      if (this.character.postingBehavior.dontTweetAt?.includes(mention.user_id_str)) {
        logger.info(`Skipping mention ${mention.id_str}: User in dontTweetAt list`);
        return true;
      }

      return false;
    } catch (e) {
      logger.error(`Error in shouldSkipMention for mention ${mention.id_str}:`, e);
      if (e instanceof Error) {
        logger.error("Error stack:", e.stack);
      }
      // If there's an error checking, better to skip
      return true;
    }
  }

  private async getTimeline(): Promise<Tweet[]> {
    const tweets = await this.scraper.fetchHomeTimeline(50, []);
    const cleanedTweets: Tweet[] = [];

    logger.debug(`Got ${tweets.length} tweets from timeline`);

    for (const tweet of tweets) {
      try {
        const tweetData = tweet.tweet || tweet;
        if (
          !tweetData?.legacy?.full_text ||
          !tweetData?.legacy?.created_at ||
          !tweetData?.rest_id ||
          !tweetData?.core?.user_results?.result?.legacy?.screen_name
        ) {
          logger.debug("Malformed tweet data received");
          continue;
        }

        let user_id_str = tweetData.legacy.user_id_str;
        let user_screen_name = tweetData.core.user_results.result.legacy.screen_name;
        if (!user_id_str) {
          logger.debug("Could not get user info from tweet");
          continue;
        }
        
        cleanedTweets.push({
          id_str: tweetData.rest_id,
          user_id_str: user_id_str,
          user_screen_name: user_screen_name,
          full_text: tweetData.legacy.full_text,
          conversation_id_str: tweetData.legacy.conversation_id_str,
          tweet_created_at: new Date(tweetData.legacy.created_at).toISOString(),
          in_reply_to_status_id_str: tweetData.legacy.in_reply_to_status_id_str || "",
          in_reply_to_user_id_str: tweetData.legacy.in_reply_to_user_id_str || "",
          in_reply_to_screen_name: tweetData.legacy.in_reply_to_screen_name || "",
        });
      } catch (e) {
        logger.debug("Error processing tweet:", e);
        continue;
      }
    }

    logger.debug(`Returning ${cleanedTweets.length} cleaned tweets`);
    return cleanedTweets;
  }

  private async findMentions(mentionsLimit: number) {
    const query = `@${this.character.username} -from:${this.character.username} -filter:retweets ${this.character.postingBehavior.shouldIgnoreTwitterReplies ? "-filter:replies" : ""}`;
    const mentions = await this.scraper.searchTweets(
      query,
      mentionsLimit,
      SearchMode.Latest,
    );
 
    const cleanedMentions = [];
    for await (const mention of mentions) {
      if (!mention.username) continue;
      const profile = await this.scraper.getProfile(mention.username);
      if (!profile.followersCount) continue;
      if (profile.followersCount < 5) {
        logger.info(
          `Mention ${mention.id} skipped, user ${mention.username} has less than 50 followers`,
        );
        continue;
      }
      
    //the response object shows us inReplyToStatusId, but it doesnt show us the user_id_str of that tweet
    //for now we check the db to see if its our character and avoid another call to twitter api
    //if its not a reply to our character, those fields will be empty
      const cleanedMention = {
        id_str: mention.id,
        username: mention.username,
        tweet_created_at: mention.timeParsed?.toISOString() || "",
        full_text: mention.text,
        user_id_str: mention.userId,
        conversation_id: mention.conversationId,
        in_reply_to_status_id_str: mention.inReplyToStatusId,
      } as Mention;
      const characterTweet = getTweetById(mention.inReplyToStatusId || "");
      cleanedMention.in_reply_to_user_id_str = characterTweet?.user_id_str || "";
      cleanedMention.in_reply_to_screen_name = characterTweet?.user_screen_name || "";
      cleanedMentions.push(cleanedMention);
    }
    return cleanedMentions;
  }

  private async sendTweetWithMedia(text: string, imageBuffer: Buffer) {
    return await this.scraper.sendTweet(text, "", [
      { data: imageBuffer, mediaType: "image/jpeg" },
    ]);
  }

  private async generateImageForTwitterPost(completion: {
    prompt: string;
    reply: string;
  }) {
    let imagePrompt = await generateImagePromptForCharacter(
      completion.reply,
      this.character,
    );
    //TODO: Check if imagePrompt was banned here
    const imageBuffer = await generateImageForTweet(
      imagePrompt,
      this.character,
    );
    return imageBuffer;
  }

  private async getUserId(userScreenName: string): Promise<string> {
    try {
      const userId = await this.scraper.getUserIdByScreenName(userScreenName);
      if (!userId) {
        logger.error("Could not get user id for user:", userScreenName);
        throw new Error(`Could not get user id for user: ${userScreenName}`);
      }
      return userId;
    } catch (e) {
      logger.debug("Error getting user id:", e);
      throw e;
    }
  }

  private readonly INTERACTION_LIMIT = 3;
  private readonly INTERACTION_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds
}

