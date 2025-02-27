import * as fs from "fs";
import { Scraper, SearchMode } from "agent-twitter-client";

import { Character } from "../characters";
import {
  generateImagePromptForCharacter,
  generateReply,
  generateTopicPost,
  generateTweetSummary,
} from "../completions";
import { saveTweet as saveTweet, getTweetById } from "../database";
import { generateImageForTweet } from "../images";
import { logger } from "../logger";
import { randomInterval } from "../utils";
import { TwitterCreateTweetResponse } from "./types";
import { Tweet, Prompt } from "../database/types";
import {
  formatTwitterHistoryForPrompt,
  getConversationHistory,
  getTwitterHistory,
  getUserInteractionCount,
  savePrompt,
} from "../database/tweets";
import {
  storeTweetEmbedding,
  isTweetTooSimilar,
} from "../embeddings/tweet-embeddings";
interface Mention {
  idStr: string;
  userScreenName: string;
  tweetCreatedAt: string;
  fullText: string;
  userIdStr: string;
  conversationId: string;
  inReplyToStatusIdStr?: string;
  inReplyToUserIdStr?: string;
  inReplyToScreenName?: string;
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
    this.character.userIdStr = await this.getUserId(this.character.username);
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
      const botHistory = await getTwitterHistory(
        this.character.userIdStr,
        this.character.userIdStr,
      );
      const formattedHistory = formatTwitterHistoryForPrompt(botHistory);
      let completion;
      let isSimilar = true;
      let isTooLong = true;
      let attemptCount = 0;
      const maxAttempts = 5;
      // maxpostlength is what gets passed to the prompt.  it does not abide, so its more like a suggestion
      let maxPostLength = this.character.postingBehavior.maxPostLength || 280;

      while ((isSimilar || isTooLong) && attemptCount < maxAttempts) {
        completion = await generateTopicPost(this.character, maxPostLength);
        logger.info("LLM completion attempt done.");

        isSimilar = await isTweetTooSimilar(completion.reply);
        if (isSimilar) {
          logger.warn(
            `Generated tweet is too similar, retrying... Attempt ${attemptCount + 1}`,
          );
        }
        // the 280 here is the twitter limit
        isTooLong = completion.reply.length > 280;
        if (isTooLong) {
          logger.warn(
            `Generated tweet is ${completion.reply.length} characters long, retrying...`,
          );
          maxPostLength -= 50;
        }

        attemptCount++;
      }

      if (isSimilar || isTooLong) {
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

        const tweet: Tweet = {
          idStr: responseJson.data.create_tweet.tweet_results.result.rest_id,
          userIdStr:
            responseJson.data.create_tweet.tweet_results.result.legacy
              .user_id_str,
          tweetCreatedAt: new Date(
            responseJson.data.create_tweet.tweet_results.result.legacy.created_at,
          ).toISOString(),
          fullText:
            responseJson.data.create_tweet.tweet_results.result.legacy
              .full_text,
          userScreenName:
            responseJson.data.create_tweet.tweet_results.result.core
              .user_results.result.legacy.screen_name,
          conversationIdStr:
            responseJson.data.create_tweet.tweet_results.result.legacy
              .conversation_id_str,
          inReplyToStatusIdStr:
            responseJson.data.create_tweet.tweet_results.result.legacy
              .in_reply_to_status_id_str || undefined,
          inReplyToUserIdStr:
            responseJson.data.create_tweet.tweet_results.result.legacy
              .in_reply_to_user_id_str || undefined,
          inReplyToScreenName:
            responseJson.data.create_tweet.tweet_results.result.legacy
              .in_reply_to_screen_name || undefined,
          characterIdStr: this.character.userIdStr,
        };

        saveTweet(tweet);
        logger.info("A row was inserted into tweets.");
        savePrompt({
          tweetIdStr: tweet.idStr,
          prompt: completion.prompt,
        });
        logger.info("A row was inserted into prompts.");
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
        logger.info("A row was inserted into vector_tweets.");
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
        return new Date(current.tweetCreatedAt) >
          new Date(latest.tweetCreatedAt)
          ? current
          : latest;
      }, filteredTimeline[0]);

      if (!mostRecentTweet) {
        logger.error("No most recent tweet found");
        return;
      }

      const mostRecentTweetMinutesAgo = Math.round(
        (Date.now() - new Date(mostRecentTweet.tweetCreatedAt).getTime()) /
          1000 /
          60,
      );
      logger.info(
        `The most recent tweet was ${mostRecentTweetMinutesAgo} minutes ago.`,
      );

      const history = getTwitterHistory(
        this.character.userIdStr,
        this.character.userIdStr,
        10,
      );
      const historyByUser = getTwitterHistory(
        this.character.userIdStr,
        mostRecentTweet.userIdStr,
        10,
      );

      const formattedHistory = formatTwitterHistoryForPrompt(
        history.concat(historyByUser),
      );

      let completion;
      let isSimilar = true;
      let isTooLong = true;
      let attemptCount = 0;
      const maxAttempts = 5;
      // maxpostlength is what gets passed to the prompt.  it does not abide, so its more like a suggestion
      let maxPostLength = this.character.postingBehavior.maxPostLength || 280;

      while ((isSimilar || isTooLong) && attemptCount < maxAttempts) {
        completion = await generateReply(
          mostRecentTweet.fullText,
          this.character,
          false,
          formattedHistory,
          maxPostLength,
        );
        logger.info("LLM completion attempt done.");

        isSimilar = await isTweetTooSimilar(completion.reply);
        if (isSimilar) {
          logger.warn(
            `Generated tweet is too similar, retrying... Attempt ${attemptCount + 1}`,
          );
        }
        // the 280 here is the twitter limit
        isTooLong = completion.reply.length > 280;
        if (isTooLong) {
          logger.warn(
            `Generated tweet is ${completion.reply.length} characters long, retrying...`,
          );
          maxPostLength -= 50;
        }

        attemptCount++;
      }

      if (isSimilar || isTooLong) {
        logger.error("Max attempts reached. Skipping tweet generation.");
        return;
      }

      if (!completion) {
        logger.error("No completion found");
        return;
      }

      const sendTweetResponse = await this.scraper.sendTweet(
        completion.reply,
        mostRecentTweet.idStr,
      );

      const newTweetJson =
        (await sendTweetResponse.json()) as TwitterCreateTweetResponse;

      if (!newTweetJson.data?.create_tweet) {
        logger.error("An error occurred:", { responseJson: newTweetJson });
        return;
      }
      // save in_reply_to tweet
      saveTweet({
        idStr: mostRecentTweet.idStr,
        userIdStr: mostRecentTweet.userIdStr,
        tweetCreatedAt: mostRecentTweet.tweetCreatedAt,
        fullText: mostRecentTweet.fullText,
        userScreenName: mostRecentTweet.userScreenName,
        conversationIdStr: mostRecentTweet.conversationIdStr,
        inReplyToStatusIdStr: mostRecentTweet.inReplyToStatusIdStr || undefined,
        inReplyToUserIdStr: mostRecentTweet.inReplyToUserIdStr || undefined,
        inReplyToScreenName: mostRecentTweet.inReplyToScreenName || undefined,
        characterIdStr: this.character.userIdStr,
      });
      logger.info("in_reply_to tweet was inserted into tweets.");
      // save reply tweet
      saveTweet({
        idStr: newTweetJson.data.create_tweet.tweet_results.result.rest_id,
        userIdStr:
          newTweetJson.data.create_tweet.tweet_results.result.legacy
            .user_id_str,
        tweetCreatedAt: new Date(
          newTweetJson.data.create_tweet.tweet_results.result.legacy.created_at,
        ).toISOString(),
        fullText:
          newTweetJson.data.create_tweet.tweet_results.result.legacy.full_text,
        userScreenName:
          newTweetJson.data.create_tweet.tweet_results.result.core.user_results
            .result.legacy.screen_name,
        conversationIdStr:
          newTweetJson.data.create_tweet.tweet_results.result.legacy
            .conversation_id_str,
        inReplyToStatusIdStr:
          newTweetJson.data.create_tweet.tweet_results.result.legacy
            .in_reply_to_status_id_str || undefined,
        inReplyToUserIdStr:
          newTweetJson.data.create_tweet.tweet_results.result.legacy
            .in_reply_to_user_id_str || undefined,
        inReplyToScreenName:
          newTweetJson.data.create_tweet.tweet_results.result.legacy
            .in_reply_to_screen_name || undefined,
        characterIdStr: this.character.userIdStr,
      });
      logger.info("reply tweet was inserted into tweets.");
      //save prompt
      savePrompt({
        tweetIdStr: newTweetJson.data.create_tweet.tweet_results.result.rest_id,
        prompt: completion.prompt,
      });
      logger.info("reply tweet prompt was inserted into prompts.");
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  private filterTimeline(timeline: Tweet[]) {
    return timeline
      .filter(
        x =>
          !x.fullText.includes("http") &&
          !this.character.postingBehavior.dontTweetAt?.includes(
            x.userScreenName,
          ),
      )
      .filter(
        x => getTweetById(this.character.userIdStr, x.idStr) === undefined,
      )
      .filter(x => {
        const interactionCount = getUserInteractionCount(
          this.character.userIdStr,
          x.userIdStr,
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
          if (!mention.fullText || !mention.idStr) {
            logger.info(`Skipping mention ${mention.idStr}: No text or ID`);
            continue;
          }

          const shouldSkip = await this.shouldSkipMention(mention);
          if (shouldSkip) {
            continue;
          }

          logger.info(
            `Processing new mention ${mention.idStr} from ${mention.userScreenName}: ${mention.fullText}`,
          );

          logger.info("Waiting 15 seconds before replying");
          await new Promise(resolve => setTimeout(resolve, 15000)); // Default delay
          const history = this.getTwitterHistoryByMention(mention);
          const formattedHistory = formatTwitterHistoryForPrompt(history);
          let completion;
          let isSimilar = true;
          let isTooLong = true;
          let attemptCount = 0;
          const maxAttempts = 5;
          // maxpostlength is what gets passed to the prompt.  it does not abide, so its more like a suggestion
          let maxPostLength =
            this.character.postingBehavior.maxPostLength || 280;

          while ((isSimilar || isTooLong) && attemptCount < maxAttempts) {
            completion = await generateReply(
              mention.fullText,
              this.character,
              false,
              formattedHistory,
              maxPostLength,
            );
            logger.info("LLM completion attempt done.");

            isSimilar = await isTweetTooSimilar(completion.reply);
            if (isSimilar) {
              logger.warn(
                `Generated tweet is too similar, retrying... Attempt ${attemptCount + 1}`,
              );
            }
            // the 280 here is the twitter limit
            isTooLong = completion.reply.length > 280;
            if (isTooLong) {
              logger.warn(
                `Generated tweet is ${completion.reply.length} characters long, retrying...`,
              );
              maxPostLength -= 50;
            }

            attemptCount++;
          }

          if (isSimilar || isTooLong) {
            logger.error("Max attempts reached. Skipping tweet generation.");
            return;
          }

          if (!completion) {
            logger.error("No completion found");
            return;
          }
          logger.info(
            `Generated reply for ${mention.idStr}: ${completion.reply}`,
          );

          const sendTweetResponse = await this.scraper.sendTweet(
            completion.reply,
            mention.idStr,
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
            idStr: mention.idStr,
            userIdStr: mention.userIdStr,
            tweetCreatedAt: mention.tweetCreatedAt,
            fullText: mention.fullText,
            userScreenName: mention.userScreenName,
            conversationIdStr: mention.conversationId,
            inReplyToStatusIdStr: mention.inReplyToStatusIdStr || undefined,
            inReplyToUserIdStr: mention.inReplyToUserIdStr || undefined,
            inReplyToScreenName: mention.inReplyToScreenName || undefined,
            characterIdStr: this.character.userIdStr,
          });
          logger.info("mention was inserted into tweets.");
          //save reply tweet
          saveTweet({
            idStr: newTweetId,
            userIdStr:
              responseJson.data.create_tweet.tweet_results.result.legacy
                .user_id_str,
            tweetCreatedAt: new Date(
              responseJson.data.create_tweet.tweet_results.result.legacy.created_at,
            ).toISOString(),
            fullText:
              responseJson.data.create_tweet.tweet_results.result.legacy
                .full_text,
            userScreenName:
              responseJson.data.create_tweet.tweet_results.result.core
                .user_results.result.legacy.screen_name,
            conversationIdStr:
              responseJson.data.create_tweet.tweet_results.result.legacy
                .conversation_id_str,
            inReplyToStatusIdStr:
              responseJson.data.create_tweet.tweet_results.result.legacy
                .in_reply_to_status_id_str || undefined,
            inReplyToUserIdStr:
              responseJson.data.create_tweet.tweet_results.result.legacy
                .in_reply_to_user_id_str || undefined,
            inReplyToScreenName:
              responseJson.data.create_tweet.tweet_results.result.legacy
                .in_reply_to_screen_name || undefined,
            characterIdStr: this.character.userIdStr,
          });
          logger.info("reply tweet was inserted into tweets.");
          //save prompt
          savePrompt({
            tweetIdStr: newTweetId,
            prompt: completion.prompt,
          });
          logger.info("reply tweet prompt was inserted into prompts.");
        } catch (e) {
          logger.error(`Error processing mention ${mention.idStr}:`, e);
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
    history.push(
      ...getTwitterHistory(this.character.userIdStr, mention.userIdStr, 10),
    );
    if (mention.conversationId) {
      history.push(
        ...getConversationHistory(
          this.character.userIdStr,
          mention.conversationId,
          10,
        ),
      );
    }
    return history;
  }

  private async shouldSkipMention(mention: Mention) {
    try {
      const existingTweetInConversation = getTwitterHistory(
        this.character.userIdStr,
        this.character.userIdStr,
        1,
        mention.conversationId,
      );
      // if character has a tweet in the conversation, and the mention is not a reply to the user, skip
      if (
        existingTweetInConversation.length > 0 &&
        mention.inReplyToUserIdStr != this.character.userIdStr
      ) {
        logger.info(
          `Skipping mention ${mention.idStr}: Character has existing tweet in the conversation, and the mention is not a reply to the character`,
        );
        return true;
      }
      if (!mention.idStr || !mention.userIdStr) {
        logger.info(`Skipping mention: Missing ID or userIdStr`);
        return true;
      }

      // Skip if we've already processed this tweet
      const existingTweet = getTweetById(
        this.character.userIdStr,
        mention.idStr,
      );
      if (existingTweet) {
        logger.info(`Skipping mention ${mention.idStr}: Already processed`);
        return true;
      }

      // Get interaction count from tweets
      const interactionCount = getUserInteractionCount(
        this.character.userIdStr,
        mention.userIdStr,
        this.INTERACTION_TIMEOUT,
      );

      if (interactionCount >= this.INTERACTION_LIMIT) {
        logger.info(
          `Skipping mention ${mention.idStr}: Too many interactions (${interactionCount}) with user ${mention.userIdStr}`,
        );
        return true;
      } else {
        logger.info(
          `Mention ${mention.idStr} has ${interactionCount} interactions with user ${mention.userIdStr}`,
        );
      }

      // Skip if user is in dontTweetAt list
      if (
        this.character.postingBehavior.dontTweetAt?.includes(
          mention.userScreenName,
        )
      ) {
        logger.info(
          `Skipping mention ${mention.idStr}: User in dontTweetAt list`,
        );
        return true;
      }

      return false;
    } catch (e) {
      logger.error(
        `Error in shouldSkipMention for mention ${mention.idStr}:`,
        e,
      );
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

        let userIdStr = tweetData.legacy.user_id_str;
        let userScreenName =
          tweetData.core.user_results.result.legacy.screen_name;
        if (!userIdStr) {
          logger.debug("Could not get user info from tweet");
          continue;
        }

        cleanedTweets.push({
          idStr: tweetData.rest_id,
          userIdStr: userIdStr,
          userScreenName: userScreenName,
          fullText: tweetData.legacy.full_text,
          conversationIdStr: tweetData.legacy.conversation_id_str,
          tweetCreatedAt: new Date(tweetData.legacy.created_at).toISOString(),
          inReplyToStatusIdStr:
            tweetData.legacy.in_reply_to_status_id_str || undefined,
          inReplyToUserIdStr:
            tweetData.legacy.in_reply_to_user_id_str || undefined,
          inReplyToScreenName:
            tweetData.legacy.in_reply_to_screen_name || undefined,
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

      //the response object shows us inReplyToStatusId, but it doesnt show us the user_id_str of that tweet
      //for now we check the db to see if its our character and avoid another call to twitter api
      //if its not a reply to our character, those fields will be empty
      //maybe call the api if its worth it at some point
      const cleanedMention = {
        idStr: mention.id,
        userScreenName: mention.username,
        tweetCreatedAt: mention.timeParsed?.toISOString() || "",
        fullText: mention.text,
        userIdStr: mention.userId,
        conversationId: mention.conversationId,
        inReplyToStatusIdStr: mention.inReplyToStatusId,
      } as Mention;
      const characterTweet = mention.inReplyToStatusId
        ? getTweetById(this.character.userIdStr, mention.inReplyToStatusId)
        : undefined;
      cleanedMention.inReplyToUserIdStr =
        characterTweet?.userIdStr || undefined;
      cleanedMention.inReplyToScreenName =
        characterTweet?.userScreenName || undefined;
      cleanedMentions.push(cleanedMention);
    }
    //sort by tweetCreatedAt asc so its first in first out
    return cleanedMentions.sort(
      (a, b) =>
        new Date(a.tweetCreatedAt).getTime() -
        new Date(b.tweetCreatedAt).getTime(),
    );
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
