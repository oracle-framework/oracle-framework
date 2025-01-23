import * as fs from "fs";
import { Scraper, SearchMode } from "goat-x";

import { Character } from "../characters";
import {
  generateImagePromptForCharacter,
  generateReply,
  generateTopicPost,
  handleBannedAndLengthRetries,
} from "../completions";
import { getTweetByInputTweetId, insertTweet } from "../database";
import { generateImageForTweet } from "../images";
import { logger } from "../logger";
import { CleanedTweet } from "./types";
import { randomInterval } from "../utils";

interface Mention {
  id: string;
  user: string;
  created_at: Date;
  text: string;
  user_id_str: string;
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
      this.character.twitterUserName,
      this.character.twitterPassword,
      this.character.twitterEmail ? this.character.twitterEmail : undefined
    );
    const cookies = await this.scraper.getCookies();
    fs.writeFileSync(
      `cookies/cookies_${this.character.twitterUserName}.json`,
      JSON.stringify(cookies, null, 2),
    );
    logger.info(
      `Successfully wrote cookies for ${this.character.twitterUserName}`,
    );
  }

  public async initWithCookies() {
    const cookiesText = fs.readFileSync(
      `./cookies/cookies_${this.character.twitterUserName}.json`,
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
    return this;
  }

  public async getTimeline(): Promise<CleanedTweet[]> {
    const tweets = await this.scraper.fetchHomeTimeline(50, []);
    return tweets.map(tweet => ({
      id: tweet.tweet ? tweet.tweet.rest_id : tweet.rest_id,
      created_at: tweet.tweet
        ? new Date(tweet.tweet.legacy.created_at)
        : new Date(tweet.legacy.created_at),
      text: tweet.tweet ? tweet.tweet.legacy.full_text : tweet.legacy.full_text,
      user_id_str: tweet.tweet
        ? tweet.tweet.legacy.user_id_str
        : tweet.legacy.user_id_str,
    }));
  }

  public async findMentions(mentionsLimit: number) {
    const query = `@${this.character.twitterUserName} -from:${this.character.twitterUserName} -filter:retweets ${this.character.postingBehavior.shouldIgnoreTwitterReplies ? "-filter:replies" : ""}`;
    const mentions = await this.scraper.searchTweets(
      query,
      mentionsLimit,
      SearchMode.Latest,
    );

    const cleanedMentions = [];
    for await (const mention of mentions) {
      const cleanedMention = {
        id: mention.id,
        user: mention.username,
        created_at: mention.timeParsed,
        text: mention.text,
        user_id_str: mention.userId,
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

  private async handleTopicPostResponse(completion: any, response: any) {
    const responseJson = await response.json();
    if (!responseJson.data?.create_tweet) {
      logger.error("An error occurred:", { responseJson });
      logger.error("responseJson.errors", responseJson.errors);
      return;
    }

    const newTweetId =
      responseJson.data.create_tweet.tweet_results.result.rest_id;
    logger.info(`The reply tweet was sent: ${newTweetId}`);

    insertTweet(this.character.twitterUserName, {
      input_tweet_id: "",
      input_tweet_created_at: "",
      input_tweet_text: "",
      input_tweet_user_id: "",
      new_tweet_id: newTweetId,
      prompt: completion.prompt,
      new_tweet_text: completion.reply,
    });
    logger.info("A row was inserted into the database.\n");
  }

  private async writeTopicPost() {
    logger.info(
      `***CALLING writeTopicPost for ${this.character.internalName} at ${new Date().toLocaleString()}***`,
    );

    try {
      const completion = await generateTopicPost(this.character);
      logger.info("The LLM completion was completed.");

      let sendTweetResponse;
      const shouldGenerateImage =
        this.character.postingBehavior.generateImagePrompt &&
        Math.random() <
          (this.character.postingBehavior.imagePromptChance || 0.3);

      logger.debug(`shouldGenerateImage: ${shouldGenerateImage}`);

      if (shouldGenerateImage) {
        try {
          let imagePrompt = await generateImagePromptForCharacter(
            completion.reply,
            this.character,
          );
          imagePrompt = await handleBannedAndLengthRetries(
            imagePrompt,
            imagePrompt,
            this.character,
            1024,
            3,
          );
          const imageBuffer = await generateImageForTweet(
            imagePrompt,
            this.character,
          );
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

      await this.handleTopicPostResponse(completion, sendTweetResponse);
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
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
      await this.writeTopicPost();
      randomInterval(() => this.writeTopicPost(), lowerBound, upperBound);
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

    await this.replyGuy();
    randomInterval(async () => await this.replyGuy(), lowerBound, upperBound);
  }

  private async replyGuy() {
    logger.info(
      `***CALLING replyGuy for ${this.character.internalName} at ${new Date().toLocaleString()}***`,
    );

    try {
      let timeline = await this.getTimeline();
      logger.info(`Fetched ${timeline.length} posts from the timeline.`);

      timeline = timeline.filter(
        x =>
          !x.text.includes("http") &&
          !this.processedTweets.includes(x.id) &&
          !this.recentUsersTweetedAt.includes(x.user_id_str) &&
          !this.character.postingBehavior.dontTweetAt?.includes(x.user_id_str),
      );

      logger.info(`After filtering, ${timeline.length} posts remain.`);
      const mostRecentTweet = timeline.reduce((latest, current) => {
        return new Date(current.created_at) > new Date(latest.created_at)
          ? current
          : latest;
      }, timeline[0]);

      const mostRecentTweetMinutesAgo = Math.round(
        (Date.now() - mostRecentTweet.created_at.getTime()) / 1000 / 60,
      );
      logger.info(
        `The most recent tweet was ${mostRecentTweetMinutesAgo} minutes ago.`,
      );

      this.recentUsersTweetedAt.push(mostRecentTweet.user_id_str);
      const completion = await generateReply(
        mostRecentTweet.text,
        this.character,
      );
      logger.info("The LLM completion was completed.");

      const sendTweetResponse = await this.scraper.sendTweet(
        completion.reply,
        mostRecentTweet.id,
      );
      await this.handleAutoReplyResponse(
        completion,
        sendTweetResponse,
        mostRecentTweet,
      );
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  private processedTweets: string[] = [];
  private recentUsersTweetedAt: string[] = [];
  private recentInteractions = new Map<string, number>();
  private userInteractionCounts = new Map<string, number>();
  private readonly INTERACTION_LIMIT = 3;
  private readonly INTERACTION_TIMEOUT = 60 * 60 * 1000; // 1 hour

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

  private async replyToMentions() {
    logger.info("Running replyToMentions", new Date().toISOString());
    const mentions = await this.findMentions(10);
    logger.info(`Found ${mentions.length} mentions`);

    for (const mention of mentions) {
      try {
        if (await this.shouldSkipMention(mention)) continue;
        if (!mention.text) continue;

        logger.info(
          `Processing new mention ${mention.id} from ${mention.user}`,
        );
        const completion = await generateReply(mention.text, this.character);

        await new Promise(resolve => setTimeout(resolve, 15000)); // Default delay
        await this.scraper.sendTweet(completion.reply, mention.id);

        await this.recordInteraction(mention);
        await this.saveMentionToDb(mention, completion);
      } catch (e) {
        logger.error(`Error processing mention ${mention.id}:`, e);
      }
    }
    logger.info("Finished replyToMentions", new Date().toISOString());
  }

  private async shouldSkipMention(mention: Mention) {
    if (!mention.id) return true;

    const existingReply = await getTweetByInputTweetId(mention.id);
    if (existingReply) {
      logger.info(`Already replied to tweet ${mention.id}, skipping...`);
      return true;
    }

    const lastInteraction = this.recentInteractions.get(mention.user_id_str);
    const now = Date.now();
    if (lastInteraction && now - lastInteraction < this.INTERACTION_TIMEOUT) {
      logger.info(
        `Recently interacted with user ${mention.user_id_str}, skipping...`,
      );
      return true;
    }

    const interactionCount =
      this.userInteractionCounts.get(mention.user_id_str) || 0;
    if (interactionCount >= this.INTERACTION_LIMIT) {
      logger.info(
        `Interaction limit reached for user ${mention.user_id_str}, skipping...`,
      );
      return true;
    }

    return false;
  }

  private async recordInteraction(mention: Mention) {
    const now = Date.now();
    this.recentInteractions.set(mention.user_id_str, now);
    const count = this.userInteractionCounts.get(mention.user_id_str) || 0;
    this.userInteractionCounts.set(mention.user_id_str, count + 1);
  }

  private async saveMentionToDb(mention: Mention, completion: any) {
    insertTweet(this.character.twitterUserName, {
      input_tweet_id: mention.id,
      input_tweet_created_at: mention.created_at.toISOString(),
      input_tweet_text: mention.text,
      input_tweet_user_id: mention.user_id_str,
      new_tweet_id: completion.reply,
      prompt: completion.prompt,
      new_tweet_text: completion.reply,
    });
    logger.info("A row was inserted into the database.\n");
  }

  private async handleAutoReplyResponse(
    completion: any,
    response: any,
    originalTweet: any,
  ) {
    const responseJson = await response.json();
    if (!responseJson.data?.create_tweet) {
      logger.error("An error occurred:", { responseJson });
      logger.error("responseJson.errors", responseJson.errors);
      return;
    }

    const newTweetId =
      responseJson.data.create_tweet.tweet_results.result.rest_id;
    logger.info(`The reply tweet was sent: ${newTweetId}`);

    insertTweet(this.character.twitterUserName, {
      input_tweet_id: originalTweet.id,
      input_tweet_created_at: originalTweet.created_at.toISOString(),
      input_tweet_text: originalTweet.text,
      input_tweet_user_id: originalTweet.user_id_str,
      new_tweet_id: newTweetId,
      prompt: completion.prompt,
      new_tweet_text: completion.reply,
    });
    logger.info("A row was inserted into the database.\n");
  }
}
