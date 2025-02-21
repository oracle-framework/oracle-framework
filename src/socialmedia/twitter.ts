import * as fs from "fs";
import { Scraper, SearchMode } from "goat-x";

import { Character } from "../characters";
import {
  generateImagePromptForCharacter,
  generateReply,
  generateTopicPost,
  generateTweetSummary,
} from "../completions";
import { saveTweet as saveTweet, getTweetByInputTweetId } from "../database";
import { generateImageForTweet } from "../images";
import { logger } from "../logger";
import { randomInterval, RandomIntervalHandle } from "../utils";
import { CleanedTweet } from "./types";
import {
  formatTwitterHistoryForPrompt,
  getConversationHistory,
  getTwitterHistory,
  getTwitterHistoryByUsername,
  getUserInteractionCount,
  TwitterHistory,
} from "../database/tweets";
import {
  storeTweetEmbedding,
  isTweetTooSimilar,
} from "../embeddings/tweet-embeddings";
interface Mention {
  id: string;
  user: string;
  created_at: Date;
  text: string;
  user_id_str: string;
  conversation_id?: string;
}

interface TwitterCreateTweetResponse {
  data?: {
    create_tweet: {
      tweet_results: {
        result: {
          rest_id: string;
        };
      };
    };
  };
  errors?: Array<{
    message: string;
    code: string;
  }>;
}

export class TwitterProvider {
  private static instances: Map<string, TwitterProvider> = new Map();
  private scraper: Scraper;
  private character: Character;
  private autoResponderActive: boolean = false;
  private topicPostingActive: boolean = false;
  private replyingToMentionsActive: boolean = false;

  // Track intervals and their timing information
  private topicPostingInterval: RandomIntervalHandle | null = null;
  private autoResponderInterval: RandomIntervalHandle | null = null;
  private replyToMentionsInterval: RandomIntervalHandle | null = null;

  // Store timestamps and intervals for resuming
  private lastTopicPostingState: {
    timestamp: number;
    interval: number;
  } | null = null;
  private lastAutoResponderState: {
    timestamp: number;
    interval: number;
  } | null = null;
  private lastReplyToMentionsState: {
    timestamp: number;
    interval: number;
  } | null = null;

  private constructor(character: Character) {
    this.character = character;
    this.scraper = new Scraper();
  }

  public static async getInstance(
    character: Character,
  ): Promise<TwitterProvider> {
    const key = character.username;
    if (!TwitterProvider.instances.has(key)) {
      const provider = new TwitterProvider(character);
      await provider.initialize();
      TwitterProvider.instances.set(key, provider);
    }
    return TwitterProvider.instances.get(key)!;
  }

  private async initialize() {
    if (!this.character.twitterPassword) {
      logger.info(
        `Twitter not configured for ${this.character.username}, skipping initialization`,
      );
      return;
    }

    try {
      const cookiesExist = await this.hasCookies();
      if (!cookiesExist) {
        logger.info(
          `No cookies found for ${this.character.username}, logging in to Twitter...`,
        );
        await this.login();
      } else {
        logger.info(
          `Found existing cookies for ${this.character.username}, initializing...`,
        );
        await this.initWithCookies();
      }
    } catch (error) {
      logger.error(
        `Failed to initialize Twitter provider for ${this.character.username}:`,
        error,
      );
      throw error; // Re-throw to prevent the provider from being stored in instances
    }
  }

  private async login() {
    logger.info(`Logging in to Twitter as ${this.character.username}...`);
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
    await this.initWithCookies();
  }

  private async initWithCookies() {
    try {
      const cookiesPath = `./cookies/cookies_${this.character.username}.json`;
      if (!fs.existsSync(cookiesPath)) {
        throw new Error(`No cookies file found for ${this.character.username}`);
      }

      const cookiesText = fs.readFileSync(cookiesPath, "utf8");
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
      logger.info(`Initialized cookies for ${this.character.username}`);
    } catch (error) {
      logger.error(
        `Failed to initialize cookies for ${this.character.username}:`,
        error,
      );
      throw error;
    }
  }

  private calculateRemainingInterval(
    lastState: { timestamp: number; interval: number } | null,
    defaultInterval: number,
  ): number | undefined {
    if (!lastState) return undefined;

    const elapsedTime = Date.now() - lastState.timestamp;
    const remainingTime = lastState.interval - elapsedTime;

    // If more time has passed than the original interval, return 0 to trigger immediately
    if (remainingTime <= 0) return 0;

    return remainingTime;
  }

  public async startTopicPosts() {
    if (this.topicPostingActive) {
      throw new Error("Topic posting is already active");
    }

    const defaultBound = 30;
    const {
      topicInterval = 45 * 60 * 1000,
      lowerBoundPostingInterval = defaultBound,
      upperBoundPostingInterval = defaultBound,
    } = this.character.postingBehavior;

    const lowerBound = topicInterval - lowerBoundPostingInterval * 60 * 1000;
    const upperBound = topicInterval + upperBoundPostingInterval * 60 * 1000;

    try {
      // Calculate remaining time if we're resuming
      const remainingInterval = this.calculateRemainingInterval(
        this.lastTopicPostingState,
        topicInterval,
      );

      // If remainingInterval is 0, make a post immediately
      if (remainingInterval === 0) {
        await this.generateTimelinePost();
      }

      // Set up interval for future posts
      this.topicPostingActive = true;
      this.topicPostingInterval = randomInterval(
        async () => {
          try {
            await this.generateTimelinePost();
          } catch (error) {
            logger.error("Error in topic posting interval:", error);
            await this.stopTopicPosts();
          }
        },
        lowerBound,
        upperBound,
        remainingInterval === 0 ? undefined : remainingInterval, // If we just posted, get fresh interval
      );

      // Store current state for future resume
      this.lastTopicPostingState = {
        timestamp: Date.now(),
        interval: this.topicPostingInterval.currentInterval,
      };
    } catch (error) {
      logger.error("Error starting topic posts:", error);
      this.topicPostingActive = false;
      throw error;
    }
  }

  public async stopTopicPosts() {
    if (this.topicPostingInterval) {
      // Store the current state before stopping
      this.lastTopicPostingState = {
        timestamp: Date.now(),
        interval: this.topicPostingInterval.currentInterval,
      };
      clearTimeout(this.topicPostingInterval.timer);
      this.topicPostingInterval = null;
    }
    this.topicPostingActive = false;
    logger.info(`Stopped topic posting for ${this.character.username}`);
  }

  public async startAutoResponder() {
    if (this.autoResponderActive) {
      throw new Error("Auto responder is already active");
    }

    const defaultBound = 60;
    const defaultInterval = 15 * 60 * 1000; // 15 minutes default
    const lowerBound =
      this.character.postingBehavior.replyInterval ||
      defaultInterval -
        (this.character.postingBehavior.lowerBoundPostingInterval ||
          defaultBound) *
          60 *
          1000;
    const upperBound =
      this.character.postingBehavior.replyInterval ||
      defaultInterval +
        (this.character.postingBehavior.upperBoundPostingInterval ||
          defaultBound) *
          60 *
          1000;

    try {
      // Calculate remaining time if we're resuming
      const remainingInterval = this.calculateRemainingInterval(
        this.lastAutoResponderState,
        defaultInterval,
      );

      // If remainingInterval is 0, respond immediately
      if (remainingInterval === 0) {
        await this.generateTimelineResponse();
      }

      // Set up interval for future responses
      this.autoResponderActive = true;
      this.autoResponderInterval = randomInterval(
        async () => {
          try {
            await this.generateTimelineResponse();
          } catch (error) {
            logger.error("Error in auto responder interval:", error);
            await this.stopAutoResponder();
          }
        },
        lowerBound,
        upperBound,
        remainingInterval === 0 ? undefined : remainingInterval, // If we just responded, get fresh interval
      );

      // Store current state for future resume
      this.lastAutoResponderState = {
        timestamp: Date.now(),
        interval: this.autoResponderInterval.currentInterval,
      };
    } catch (error) {
      logger.error("Error starting auto responder:", error);
      this.autoResponderActive = false;
      throw error;
    }
  }

  public async stopAutoResponder() {
    if (this.autoResponderInterval) {
      // Store the current state before stopping
      this.lastAutoResponderState = {
        timestamp: Date.now(),
        interval: this.autoResponderInterval.currentInterval,
      };
      clearTimeout(this.autoResponderInterval.timer);
      this.autoResponderInterval = null;
    }
    this.autoResponderActive = false;
    logger.info(`Stopped auto responder for ${this.character.username}`);
  }

  public async startReplyingToMentions() {
    if (this.replyingToMentionsActive) {
      throw new Error("Reply to mentions is already active");
    }

    const defaultBound = 2;
    const defaultInterval = 10 * 60 * 1000; // 10 minutes default
    const lowerBound =
      defaultInterval -
      (this.character.postingBehavior.lowerBoundPostingInterval ||
        defaultBound) *
        60 *
        1000;
    const upperBound =
      defaultInterval +
      (this.character.postingBehavior.upperBoundPostingInterval ||
        defaultBound) *
        60 *
        1000;

    try {
      // Calculate remaining time if we're resuming
      const remainingInterval = this.calculateRemainingInterval(
        this.lastReplyToMentionsState,
        defaultInterval,
      );

      // If remainingInterval is 0, check mentions immediately
      if (remainingInterval === 0) {
        await this.replyToMentions();
      }

      // Set up interval for future checks
      this.replyingToMentionsActive = true;
      this.replyToMentionsInterval = randomInterval(
        async () => {
          try {
            await this.replyToMentions();
          } catch (error) {
            logger.error("Error in reply to mentions interval:", error);
            await this.stopReplyingToMentions();
          }
        },
        lowerBound,
        upperBound,
        remainingInterval === 0 ? undefined : remainingInterval, // If we just checked, get fresh interval
      );

      // Store current state for future resume
      this.lastReplyToMentionsState = {
        timestamp: Date.now(),
        interval: this.replyToMentionsInterval.currentInterval,
      };
    } catch (error) {
      logger.error("Error starting reply to mentions:", error);
      this.replyingToMentionsActive = false;
      throw error;
    }
  }

  public async stopReplyingToMentions() {
    if (this.replyToMentionsInterval) {
      // Store the current state before stopping
      this.lastReplyToMentionsState = {
        timestamp: Date.now(),
        interval: this.replyToMentionsInterval.currentInterval,
      };
      clearTimeout(this.replyToMentionsInterval.timer);
      this.replyToMentionsInterval = null;
    }
    this.replyingToMentionsActive = false;
    logger.info(`Stopped replying to mentions for ${this.character.username}`);
  }

  // Add cleanup method for when we need to destroy the provider
  public async cleanup() {
    await this.stopTopicPosts();
    await this.stopAutoResponder();
    await this.stopReplyingToMentions();

    // Clear stored states
    this.lastTopicPostingState = null;
    this.lastAutoResponderState = null;
    this.lastReplyToMentionsState = null;
  }

  private async generateTimelinePost() {
    logger.info(
      `Calling generateTimelinePost for ${this.character.username} at ${new Date().toLocaleString()}`,
    );

    try {
      let completion;
      let isSimilar = true;
      let attemptCount = 0;
      const maxAttempts = 3;

      while (isSimilar && attemptCount < maxAttempts) {
        completion = await generateTopicPost(this.character);
        logger.info("LLM completion attempt done.");

        isSimilar = await isTweetTooSimilar(completion.reply);
        if (isSimilar) {
          logger.warn(
            `Generated tweet is too similar, retrying... Attempt ${attemptCount + 1}`,
          );
        }
        attemptCount++;
      }

      if (isSimilar) {
        logger.error("Max attempts reached. Skipping tweet generation.");
        return;
      }

      if (completion) {
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

        saveTweet(this.character.username, {
          input_tweet_id: "",
          input_tweet_created_at: "",
          input_tweet_text: "",
          input_tweet_user_id: "",
          input_tweet_username: "",
          new_tweet_id: newTweetId,
          prompt: completion.prompt,
          new_tweet_text: completion.reply,
        });

        // Store tweet embedding
        const tweetTextSummary = await generateTweetSummary(
          this.character,
          completion.reply,
        );
        if (tweetTextSummary) {
          await storeTweetEmbedding(
            this.character.username,
            newTweetId,
            completion.reply,
            tweetTextSummary,
            new Date().toISOString(),
          );
        }
        logger.info("A row was inserted into the database.\n");
      }
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
        return new Date(current.created_at) > new Date(latest.created_at)
          ? current
          : latest;
      }, filteredTimeline[0]);

      if (!mostRecentTweet) {
        logger.error("No most recent tweet found");
        return;
      }

      const mostRecentTweetMinutesAgo = Math.round(
        (Date.now() - mostRecentTweet.created_at.getTime()) / 1000 / 60,
      );
      logger.info(
        `The most recent tweet was ${mostRecentTweetMinutesAgo} minutes ago.`,
      );

      const history = getTwitterHistoryByUsername(this.character.username, 10);

      const historyByUser = getTwitterHistory(mostRecentTweet.user_id_str, 10);

      const formattedHistory = formatTwitterHistoryForPrompt(
        history.concat(historyByUser),
      );

      const completion = await generateReply(
        mostRecentTweet.text,
        this.character,
        false,
        formattedHistory,
      );

      logger.info("LLM completion done.");

      const sendTweetResponse = await this.scraper.sendTweet(
        completion.reply,
        mostRecentTweet.id,
      );

      const newTweetJson =
        (await sendTweetResponse.json()) as TwitterCreateTweetResponse;

      if (!newTweetJson.data?.create_tweet) {
        logger.error("An error occurred:", { responseJson: newTweetJson });
        return;
      }

      saveTweet(this.character.username, {
        input_tweet_id: mostRecentTweet.id,
        input_tweet_created_at: mostRecentTweet.created_at.toISOString(),
        input_tweet_text: mostRecentTweet.text,
        input_tweet_user_id: mostRecentTweet.user_id_str,
        input_tweet_username: mostRecentTweet.user,
        new_tweet_id:
          newTweetJson.data.create_tweet.tweet_results.result.rest_id,
        prompt: completion.prompt,
        new_tweet_text: completion.reply,
      });
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  private filterTimeline(timeline: CleanedTweet[]) {
    return timeline
      .filter(
        x =>
          !x.text.includes("http") &&
          !this.character.postingBehavior.dontTweetAt?.includes(x.user_id_str),
      )
      .filter(x => getTweetByInputTweetId(x.id) === undefined)
      .filter(x => {
        const interactionCount = getUserInteractionCount(
          x.user_id_str,
          this.character.username,
          this.INTERACTION_TIMEOUT,
        );
        return interactionCount < this.INTERACTION_LIMIT;
      });
  }

  private async replyToMentions() {
    logger.info("Running replyToMentions", new Date().toISOString());
    try {
      const mentions = await this.findMentions(10);
      logger.info(`Found ${mentions.length} mentions`);

      for (const mention of mentions) {
        try {
          if (!mention.text || !mention.id) {
            logger.info(`Skipping mention ${mention.id}: No text or ID`);
            continue;
          }

          const shouldSkip = await this.shouldSkipMention(mention);
          if (shouldSkip) {
            logger.info(
              `Skipping mention ${mention.id}: Already processed or too many interactions`,
            );
            continue;
          }

          logger.info(
            `Processing new mention ${mention.id} from ${mention.user}: ${mention.text}`,
          );

          logger.info("Waiting 15 seconds before replying");
          await new Promise(resolve => setTimeout(resolve, 15000)); // Default delay
          const history = this.getTwitterHistoryByMention(mention);
          const formattedHistory = formatTwitterHistoryForPrompt(
            history,
            false,
          );

          const completion = await generateReply(
            mention.text,
            this.character,
            false,
            formattedHistory,
          );

          logger.info(`Generated reply for ${mention.id}: ${completion.reply}`);

          const sendTweetResponse = await this.scraper.sendTweet(
            completion.reply,
            mention.id,
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

          saveTweet(this.character.username, {
            input_tweet_id: mention.id,
            input_tweet_created_at: mention.created_at.toISOString(),
            input_tweet_text: mention.text,
            input_tweet_user_id: mention.user_id_str,
            input_tweet_username: mention.user,
            new_tweet_id: newTweetId,
            prompt: completion.prompt,
            new_tweet_text: completion.reply,
            conversation_id: mention.conversation_id,
          });
        } catch (e) {
          logger.error(`Error processing mention ${mention.id}:`, e);
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

  private getTwitterHistoryByMention(mention: Mention): TwitterHistory[] {
    let history: TwitterHistory[] = [];
    history.push(...getTwitterHistory(mention.user_id_str, 10));
    if (mention.conversation_id) {
      history.push(...getConversationHistory(mention.conversation_id, 10));
    }
    return history;
  }

  private async shouldSkipMention(mention: Mention) {
    try {
      if (!mention.id || !mention.user_id_str) {
        logger.info(`Skipping mention: Missing ID or user_id_str`);
        return true;
      }

      // Skip if we've already processed this tweet
      const existingTweet = getTweetByInputTweetId(mention.id);
      if (existingTweet) {
        logger.info(`Skipping mention ${mention.id}: Already processed`);
        return true;
      }

      // Get interaction count from twitter_history
      const interactionCount = getUserInteractionCount(
        mention.user_id_str,
        this.character.username,
        this.INTERACTION_TIMEOUT,
      );

      if (interactionCount > this.INTERACTION_LIMIT) {
        logger.info(
          `Skipping mention ${mention.id}: Too many interactions (${interactionCount}) with user ${mention.user_id_str}`,
        );
        return true;
      }

      // Skip if user is in dontTweetAt list
      if (this.character.postingBehavior.dontTweetAt?.includes(mention.user)) {
        logger.info(`Skipping mention ${mention.id}: User in dontTweetAt list`);
        return true;
      }

      return false;
    } catch (e) {
      logger.error(`Error in shouldSkipMention for mention ${mention.id}:`, e);
      if (e instanceof Error) {
        logger.error("Error stack:", e.stack);
      }
      // If there's an error checking, better to skip
      return true;
    }
  }

  private async getTimeline(): Promise<CleanedTweet[]> {
    const tweets = await this.scraper.fetchHomeTimeline(50, []);
    const cleanedTweets = [];

    logger.debug(`Got ${tweets.length} tweets from timeline`);

    for (const tweet of tweets) {
      try {
        const tweetData = tweet.tweet || tweet;
        if (
          !tweetData?.legacy?.full_text ||
          !tweetData?.legacy?.created_at ||
          !tweetData?.rest_id
        ) {
          logger.debug("Malformed tweet data received");
          continue;
        }

        let user_id_str = tweetData.legacy.user_id_str;
        let user = tweetData.legacy.user?.screen_name || "";
        if (!user_id_str) {
          logger.debug("Could not get user info from tweet");
          continue;
        }

        cleanedTweets.push({
          id: tweetData.rest_id,
          created_at: new Date(tweetData.legacy.created_at),
          text: tweetData.legacy.full_text,
          user_id_str,
          user,
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
      if (profile.followersCount < 50) {
        logger.info(
          `Mention ${mention.id} skipped, user ${mention.username} has less than 50 followers`,
        );
        continue;
      }
      const cleanedMention = {
        id: mention.id,
        user: mention.username,
        created_at: mention.timeParsed,
        text: mention.text,
        user_id_str: mention.userId,
        conversation_id: mention.conversationId,
      } as Mention;
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

  public isAutoResponderActive(): boolean {
    return this.autoResponderActive;
  }

  public isTopicPostingActive(): boolean {
    return this.topicPostingActive;
  }

  public isReplyingToMentions(): boolean {
    return this.replyingToMentionsActive;
  }

  public async hasCookies(): Promise<boolean> {
    try {
      const cookiesPath = `./cookies/cookies_${this.character.username}.json`;
      return fs.existsSync(cookiesPath);
    } catch (error) {
      return false;
    }
  }

  private readonly INTERACTION_LIMIT = 3;
  private readonly INTERACTION_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds
}
