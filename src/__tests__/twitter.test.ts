import { TwitterProvider } from "../socialmedia/twitter";
import { Character } from "../characters";
import {
  formatTwitterHistoryForPrompt,
  TwitterHistory,
} from "../database/tweets";
import { getAllTweets } from "./helpers/test-db";
import { logger } from "../logger";
import * as utils from "../utils";
import { db } from "../database/db";
import { Database } from "better-sqlite3";
import {
  generateReply,
  generateTopicPost,
  handleBannedAndLengthRetries,
} from "../completions";
import * as completions from "../completions";

// Mock the logger
jest.mock("../logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the completions module
jest.mock("../completions", () => ({
  generateTopicPost: jest.fn().mockResolvedValue({
    prompt: "Test prompt",
    reply: "Test tweet content",
  }),
  generateReply: jest.fn(),
  handleBannedAndLengthRetries: jest.fn().mockImplementation(prompt => prompt),
  generateImagePromptForCharacter: jest
    .fn()
    .mockResolvedValue("Test image prompt"),
  checkIfPromptWasBanned: jest
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false),
  generateCompletionForCharacter: jest.fn().mockResolvedValue("safe content"),
}));

// Mock the images module
jest.mock("../images", () => ({
  generateImageForTweet: jest
    .fn()
    .mockResolvedValue(Buffer.from("test image data")),
}));

// Mock the Scraper class with full interface
const mockScraper = {
  login: jest.fn(),
  getCookies: jest.fn().mockResolvedValue([]),
  setCookies: jest.fn(),
  sendTweet: jest.fn().mockImplementation(() => ({
    json: () =>
      Promise.resolve({
        data: {
          create_tweet: {
            tweet_results: {
              result: {
                rest_id: "mock-tweet-id-123",
              },
            },
          },
        },
      }),
  })),
  getProfile: jest.fn().mockResolvedValue({ followersCount: 100 }),
  searchTweets: jest.fn(),
  fetchHomeTimeline: jest.fn().mockResolvedValue([]),
  sendTweetWithMedia: jest.fn(),
};

jest.mock("goat-x", () => ({
  Scraper: jest.fn().mockImplementation(() => mockScraper),
  SearchMode: {
    Latest: "Latest",
  },
}));

// Mock fs module
jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue("[]"),
  writeFileSync: jest.fn(),
}));

describe("TwitterProvider", () => {
  let twitterProvider: TwitterProvider;
  let testDb: Database;
  let mockRandomInterval: jest.SpyInstance;

  const mockCharacter: Character = {
    agentName: "Test Agent",
    username: "test_user",
    twitterPassword: "test_password",
    twitterEmail: "test@example.com",
    telegramApiKey: "test-telegram-key",
    bio: ["Test bio"],
    lore: ["Test lore"],
    postDirections: ["test direction"],
    postingBehavior: {
      generateImagePrompt: false,
    },
    model: "gpt-4",
    fallbackModel: "gpt-3.5-turbo",
    temperature: 0.7,
  };

  beforeAll(() => {
    testDb = db;
  });

  beforeEach(() => {
    // Clear any existing data
    testDb.prepare("DELETE FROM twitter_history").run();

    // Mock randomInterval
    mockRandomInterval = jest
      .spyOn(utils, "randomInterval")
      .mockImplementation(() => {
        return setTimeout(() => {}, 0);
      });

    twitterProvider = new TwitterProvider(mockCharacter);

    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockRandomInterval.mockRestore();
  });

  describe("Topic Posts", () => {
    it("should create initial post and set up interval", async () => {
      await twitterProvider.startTopicPosts();

      const savedTweets = getAllTweets(testDb) as TwitterHistory[];
      expect(savedTweets).toHaveLength(1);

      const savedTweet = savedTweets[0];
      expect(savedTweet.tweet_id).toBe("mock-tweet-id-123");
      expect(savedTweet.twitter_user_id).toBe("test_user");
      expect(savedTweet.is_bot_tweet).toBe(1);
      expect(savedTweet.tweet_text).toBe("Test tweet content");
      expect(savedTweet.prompt).toBe("Test prompt");

      expect(mockRandomInterval).toHaveBeenCalledWith(
        expect.any(Function),
        45 * 60 * 1000 - 30 * 60 * 1000,
        45 * 60 * 1000 + 30 * 60 * 1000,
      );

      expect(mockScraper.sendTweet).toHaveBeenCalled();
    });

    it("should handle tweet failure gracefully", async () => {
      const errorResponse = {
        data: null,
        errors: [
          {
            message: "Failed to send tweet",
            code: "ERROR_CODE",
          },
        ],
      };

      mockScraper.sendTweet.mockImplementationOnce(() => ({
        json: () => Promise.resolve(errorResponse),
      }));

      await (twitterProvider as any).generateTimelinePost();

      expect(logger.error).toHaveBeenCalledWith("An error occurred:", {
        responseJson: errorResponse,
      });

      const savedTweets = getAllTweets(testDb) as TwitterHistory[];
      expect(savedTweets).toHaveLength(0);
    });

    it("should use character attributes in prompt generation", async () => {
      const { generateTopicPost } = require("../completions");

      await twitterProvider.startTopicPosts();

      expect(generateTopicPost).toHaveBeenCalledWith(
        mockCharacter,
        expect.any(String),
      );
    });

    it("should handle image generation and attachment", async () => {
      const characterWithImages = {
        ...mockCharacter,
        postingBehavior: {
          generateImagePrompt: true,
          imagePromptChance: 1,
        },
      };
      twitterProvider = new TwitterProvider(characterWithImages);

      const { generateImageForTweet } = require("../images");
      const imageBuffer = Buffer.from("test image data");
      generateImageForTweet.mockResolvedValueOnce(imageBuffer);

      mockScraper.sendTweet.mockImplementationOnce(
        (_text: string, _replyTo: string, media: any[]) => {
          expect(media).toHaveLength(1);
          expect(media[0].mediaType).toBe("image/jpeg");
          expect(media[0].data).toEqual(imageBuffer);

          return {
            json: () =>
              Promise.resolve({
                data: {
                  create_tweet: {
                    tweet_results: {
                      result: {
                        rest_id: "mock-tweet-id-with-image-123",
                      },
                    },
                  },
                },
              }),
          };
        },
      );

      await twitterProvider.startTopicPosts();

      const savedTweets = getAllTweets(testDb) as TwitterHistory[];
      expect(savedTweets).toHaveLength(1);
      expect(savedTweets[0].tweet_id).toBe("mock-tweet-id-with-image-123");
    });

    it("should handle image generation failures", async () => {
      const characterWithImages = {
        ...mockCharacter,
        postingBehavior: {
          generateImagePrompt: true,
          imagePromptChance: 1,
        },
      };
      twitterProvider = new TwitterProvider(characterWithImages);

      const { generateImageForTweet } = require("../images");
      generateImageForTweet.mockRejectedValueOnce(
        new Error("Image generation failed"),
      );

      await twitterProvider.startTopicPosts();

      expect(logger.error).toHaveBeenCalledWith(
        "Error sending tweet with image:",
        expect.any(Error),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Falling back to sending tweet without image",
      );

      const savedTweets = getAllTweets(testDb) as TwitterHistory[];
      expect(savedTweets).toHaveLength(1);
      expect(savedTweets[0].tweet_id).toBe("mock-tweet-id-123");
    });

    it("should send proper cookies after restart", async () => {
      const fs = require("fs");
      const mockCookies =
        "undefined=undefined; Domain=undefined; Path=undefined; ; ; SameSite=Lax";
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        JSON.stringify([mockCookies]),
      );

      await twitterProvider.initWithCookies();
      await twitterProvider.startTopicPosts();

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining("cookies_test_user.json"),
        "utf8",
      );
      expect(mockScraper.setCookies).toHaveBeenCalledWith([mockCookies]);
      expect(mockScraper.sendTweet).toHaveBeenCalled();
    });

    it("should handle tweet generation failure", async () => {
      const { generateTopicPost } = require("../completions");
      generateTopicPost.mockRejectedValueOnce(new Error("Generation failed"));

      await twitterProvider.startTopicPosts();

      expect(logger.error).toHaveBeenNthCalledWith(
        1,
        "There was an error: Error: Generation failed",
      );
      expect(logger.error).toHaveBeenNthCalledWith(
        2,
        "e.message",
        "Generation failed",
      );

      const savedTweets = getAllTweets(testDb) as TwitterHistory[];
      expect(savedTweets).toHaveLength(0);
    });

    it("should handle Twitter API errors gracefully", async () => {
      const characterWithImages = {
        ...mockCharacter,
        postingBehavior: {
          generateImagePrompt: true,
          imagePromptChance: 1,
        },
      };
      twitterProvider = new TwitterProvider(characterWithImages);

      mockScraper.sendTweet
        .mockRejectedValueOnce(new Error("API Error"))
        .mockRejectedValueOnce(new Error("API Error")); // Mock fallback failure too

      await twitterProvider.startTopicPosts();

      expect(logger.error).toHaveBeenCalledWith(
        "Error sending tweet with image:",
        expect.any(Error),
      );

      const savedTweets = getAllTweets(testDb) as TwitterHistory[];
      expect(savedTweets).toHaveLength(0);
    });
  });

  describe("History Formatting", () => {
    it("should correctly format conversation history", async () => {
      // Setup test data directly in database
      testDb
        .prepare(
          `
        INSERT INTO twitter_history 
          (tweet_id, twitter_user_id, username, tweet_text, created_at, is_bot_tweet, prompt)
        VALUES 
          ('tweet1', 'test_user_id', 'test_user', 'First test tweet', '2024-01-01', 1, 'Test prompt'),
          ('tweet2', 'user2_id', 'user2', 'Original post', '2024-01-01', 0, 'Test prompt')
      `,
        )
        .run();

      // Get and format actual history from DB
      const history = getAllTweets(testDb) as TwitterHistory[];
      const formatted = formatTwitterHistoryForPrompt(history, true);

      // Verify format - should match template structure
      expect(formatted).toContain("@test_user: First test tweet");
      expect(formatted).toContain("@user2: Original post");
      expect(formatted).toContain("Prompt used: Test prompt");
    });

    it("should handle empty history gracefully", () => {
      const formatted = formatTwitterHistoryForPrompt([], true);
      expect(formatted).toBe("");
    });

    it("should filter bot tweets when requested", () => {
      testDb
        .prepare(
          `
        INSERT INTO twitter_history 
          (tweet_id, twitter_user_id, username, tweet_text, created_at, is_bot_tweet, prompt)
        VALUES 
          ('bot1', 'test_user_id', 'test_user', 'Bot tweet', '2024-01-01', 1, 'Test prompt'),
          ('human1', 'user2_id', 'user2', 'Human tweet', '2024-01-01', 0, 'Test prompt')
      `,
        )
        .run();

      const history = getAllTweets(testDb) as TwitterHistory[];
      const formatted = formatTwitterHistoryForPrompt(
        history.filter(t => !t.is_bot_tweet),
      );

      expect(formatted).not.toContain("test_user");
      expect(formatted).toContain("user2");
      expect(formatted).not.toContain("Bot tweet");
      expect(formatted).toContain("Human tweet");
    });
  });

  it("should successfully reply to a valid mention", async () => {
    const mention = {
      id: "mention1",
      userId: "12123123",
      text: "@test_user help",
      username: "good_follower",
      followersCount: 1000,
      timeParsed: new Date(),
      conversationId: "conv_123",
    };

    mockScraper.searchTweets.mockResolvedValue([mention]);

    (generateReply as jest.Mock).mockResolvedValue({
      prompt: "Test prompt",
      reply: "Buy more $AR obviously",
    });

    // Start the operation but don't await it yet
    const promise = twitterProvider.startReplyingToMentions();

    // Run all pending promises up until the timer
    await jest.runOnlyPendingTimersAsync();

    // Now await the full operation
    await promise;

    expect(mockScraper.sendTweet).toHaveBeenCalled();

    const tweets = getAllTweets(testDb);
    expect(tweets).toHaveLength(2);
  });

  it("should not reply to a tweet that has already been replied to", async () => {
    const mention = {
      id: "mention1",
      userId: "12123123",
      text: "@test_user help",
      username: "good_follower",
      followersCount: 1000,
      timeParsed: new Date(),
      conversationId: "conv_123",
    };

    mockScraper.searchTweets.mockResolvedValue([mention]);

    (generateReply as jest.Mock).mockResolvedValue({
      prompt: "Test prompt",
      reply: "Buy more $AR obviously",
    });

    // First run
    const firstPromise = twitterProvider.startReplyingToMentions();
    await jest.runOnlyPendingTimersAsync();
    await firstPromise;

    expect(mockScraper.sendTweet).toHaveBeenCalled();

    const tweets = getAllTweets(testDb);
    expect(tweets).toHaveLength(2);

    // Clear the mock
    mockScraper.sendTweet.mockClear();

    // Second run
    const secondPromise = twitterProvider.startReplyingToMentions();
    await jest.runOnlyPendingTimersAsync();
    await secondPromise;

    expect(mockScraper.sendTweet).not.toHaveBeenCalled();

    // Check that the tweet was not saved again
    const tweets2 = getAllTweets(testDb);
    expect(tweets2).toHaveLength(2);
  });

  it("should skip mentions from users in dontTweetAt list", async () => {
    const blockedUser = "blocked_user123";

    // Configure character to block this user
    const testCharacter = {
      ...mockCharacter,
      postingBehavior: {
        ...mockCharacter.postingBehavior,
        dontTweetAt: [blockedUser],
      },
    };

    const provider = new TwitterProvider(testCharacter);

    mockScraper.searchTweets.mockResolvedValue([
      {
        id: "mention1",
        userId: "12123123",
        text: "@test_user help",
        username: blockedUser,
        followersCount: 100,
      },
    ]);

    await provider.startReplyingToMentions();

    // Verify no reply was sent
    expect(mockScraper.sendTweet).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("User in dontTweetAt list"),
    );
  });

  describe("Timeline Generation", () => {
    it("should handle complete generation failure", async () => {
      const mockError = new Error("Generation failed completely");
      (generateTopicPost as jest.Mock).mockRejectedValueOnce(mockError);

      await twitterProvider["generateTimelinePost"]();

      expect(logger.error).toHaveBeenCalledWith(
        "There was an error: Error: Generation failed completely",
      );
      expect(mockScraper.sendTweet).not.toHaveBeenCalled();
    });

    it("should handle tweet text formatting edge cases", async () => {
      const tweetText = "   Tweet with extra spaces   \n\nand newlines\t\t";
      (generateTopicPost as jest.Mock).mockResolvedValueOnce({
        prompt: "Test prompt",
        reply: tweetText,
      });

      await twitterProvider["generateTimelinePost"]();

      expect(mockScraper.sendTweet).toHaveBeenCalled();
    });
  });

  describe("Timeline Response", () => {
    it("should handle empty timeline response", async () => {
      mockScraper.fetchHomeTimeline.mockResolvedValueOnce([]);
      const timeline = await twitterProvider["getTimeline"]();
      expect(timeline).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith("Got 0 tweets from timeline");
    });

    it("should handle invalid timeline response", async () => {
      mockScraper.fetchHomeTimeline.mockResolvedValueOnce([]);
      const timeline = await twitterProvider["getTimeline"]();
      expect(timeline).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith("Got 0 tweets from timeline");
    });

    it("should enforce interaction timeout limits", async () => {
      const oldTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes ago

      // Insert 3 tweets within timeout to hit the limit
      const stmt = testDb.prepare(`
        INSERT INTO twitter_history (
          twitter_user_id, tweet_id, tweet_text, created_at, is_bot_tweet, username
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        "test_user",
        "tweet1",
        "test tweet 1",
        oldTimestamp,
        1,
        "other_user",
      );
      stmt.run(
        "test_user",
        "tweet2",
        "test tweet 2",
        oldTimestamp,
        1,
        "other_user",
      );
      stmt.run(
        "test_user",
        "tweet3",
        "test tweet 3",
        oldTimestamp,
        1,
        "other_user",
      );

      const mockTweet = {
        rest_id: "1",
        legacy: {
          created_at: oldTimestamp,
          full_text: "test tweet",
          user_id_str: "other_user",
          screen_name: "other_user",
        },
      };

      mockScraper.fetchHomeTimeline.mockResolvedValueOnce([mockTweet]);
      const timeline = await twitterProvider["getTimeline"]();
      const filteredTimeline = twitterProvider["filterTimeline"](timeline);
      expect(filteredTimeline).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Got 1 tweets from timeline"),
      );
    });
  });

  describe("Timeline Processing", () => {
    it("should handle malformed tweet data", async () => {
      const malformedTweets = [
        { rest_id: "1" }, // Missing legacy
        {
          rest_id: "2",
          legacy: {}, // Missing required fields
        },
      ];

      mockScraper.fetchHomeTimeline.mockResolvedValueOnce(malformedTweets);

      const timeline = await twitterProvider["getTimeline"]();
      expect(timeline).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Malformed tweet data received"),
      );
    });

    it("should filter out tweets with links", async () => {
      const mockTweets = [
        {
          rest_id: "1",
          legacy: {
            created_at: new Date().toISOString(),
            full_text: "normal tweet",
            user_id_str: "123",
            screen_name: "user1",
          },
        },
        {
          rest_id: "2",
          legacy: {
            created_at: new Date().toISOString(),
            full_text: "tweet with http://link.com",
            user_id_str: "456",
            screen_name: "user2",
          },
        },
      ];

      mockScraper.fetchHomeTimeline.mockResolvedValueOnce(mockTweets);

      const timeline = await twitterProvider["getTimeline"]();
      const filteredTimeline = twitterProvider["filterTimeline"](timeline);
      expect(filteredTimeline).toHaveLength(1);
      expect(filteredTimeline[0].text).toBe("normal tweet");
    });

    it("should handle tweet formatting edge cases", async () => {
      const mockTweets = [
        {
          rest_id: "1",
          legacy: {
            created_at: new Date().toISOString(),
            full_text: "   tweet with\n\nextra whitespace\t\t",
            user_id_str: "123",
            screen_name: "user1",
          },
        },
      ];

      mockScraper.fetchHomeTimeline.mockResolvedValueOnce(mockTweets);

      const timeline = await twitterProvider["getTimeline"]();
      expect(timeline).toHaveLength(1);
      expect(timeline[0].text).toBe("   tweet with\n\nextra whitespace\t\t");
    });
  });

  describe("Mention Handling", () => {
    it("should skip mentions with insufficient followers", async () => {
      const mention = {
        id: "mention1",
        userId: "123",
        text: "@test_user hello",
        username: "lowfollower",
        followersCount: 40,
        timeParsed: new Date(),
        conversationId: "conv123",
      };

      mockScraper.searchTweets.mockResolvedValueOnce([mention]);
      mockScraper.getProfile.mockResolvedValueOnce({ followersCount: 40 });

      const promise = twitterProvider.startReplyingToMentions();
      await jest.runOnlyPendingTimersAsync();
      await promise;

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("has less than 50 followers"),
      );
      expect(mockScraper.sendTweet).not.toHaveBeenCalled();
    });

    it("should skip mentions from blocked users", async () => {
      const blockedCharacter = {
        ...mockCharacter,
        postingBehavior: {
          ...mockCharacter.postingBehavior,
          dontTweetAt: ["blockeduser"],
        },
      };

      const blockedProvider = new TwitterProvider(blockedCharacter);

      const mention = {
        id: "mention1",
        userId: "123",
        text: "@test_user hello",
        username: "blockeduser",
        followersCount: 100,
        timeParsed: new Date(),
        conversationId: "conv123",
      };

      mockScraper.searchTweets.mockResolvedValueOnce([mention]);
      mockScraper.getProfile.mockResolvedValueOnce({ followersCount: 100 });

      const promise = blockedProvider.startReplyingToMentions();
      await jest.runOnlyPendingTimersAsync();
      await promise;

      expect(generateReply).not.toHaveBeenCalled();
      expect(mockScraper.sendTweet).not.toHaveBeenCalled();
    });

    it("should handle API errors during mention search", async () => {
      mockScraper.searchTweets.mockRejectedValueOnce(
        new Error("API Rate limit exceeded"),
      );

      const promise = twitterProvider.startReplyingToMentions();
      await jest.runOnlyPendingTimersAsync();
      await promise;

      expect(logger.error).toHaveBeenCalledWith(
        "Error in replyToMentions:",
        expect.any(Error),
      );
      expect(mockScraper.sendTweet).not.toHaveBeenCalled();
    });

    it("should handle invalid user profile data", async () => {
      const mention = {
        id: "mention1",
        userId: "123",
        text: "@test_user hello",
        username: "user123",
        followersCount: 100,
        timeParsed: new Date(),
        conversationId: "conv123",
      };

      mockScraper.searchTweets.mockResolvedValueOnce([mention]);
      mockScraper.getProfile.mockRejectedValueOnce(
        new Error("Invalid user data"),
      );

      const promise = twitterProvider.startReplyingToMentions();
      await jest.runOnlyPendingTimersAsync();
      await promise;

      expect(logger.error).toHaveBeenCalledWith(
        "Error in replyToMentions:",
        expect.any(Error),
      );
      expect(mockScraper.sendTweet).not.toHaveBeenCalled();
    });

    it("should handle complex conversation history", async () => {
      const conversationId = "complex_conv_123";
      const mentions = [
        {
          id: "mention1",
          userId: "user1",
          text: "@test_user start conversation",
          username: "user1",
          followersCount: 100,
          timeParsed: new Date(Date.now() - 3600000), // 1 hour ago
          conversationId,
        },
        {
          id: "mention2",
          userId: "user2",
          text: "@test_user @user1 joining conversation",
          username: "user2",
          followersCount: 100,
          timeParsed: new Date(Date.now() - 1800000), // 30 mins ago
          conversationId,
        },
        {
          id: "mention3",
          userId: "user1",
          text: "@test_user @user2 continuing conversation",
          username: "user1",
          followersCount: 100,
          timeParsed: new Date(),
          conversationId,
        },
      ];

      mockScraper.searchTweets.mockResolvedValueOnce(mentions);
      mockScraper.getProfile.mockResolvedValue({ followersCount: 100 });

      const promise = twitterProvider.startReplyingToMentions();
      await jest.runAllTimersAsync();
      await promise;

      // Should process all mentions in sequence
      expect(generateReply).toHaveBeenCalledTimes(3);
      expect(generateReply).toHaveBeenLastCalledWith(
        "@test_user @user2 continuing conversation",
        mockCharacter,
        false,
        expect.any(String),
      );
      expect(mockScraper.sendTweet).toHaveBeenCalledTimes(3);
    });

    it("should handle rate limit errors gracefully", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      rateLimitError.name = "TwitterApiError";
      Object.assign(rateLimitError, { code: 88 }); // Twitter rate limit error code

      mockScraper.searchTweets.mockRejectedValueOnce(rateLimitError);

      const promise = twitterProvider.startReplyingToMentions();
      await jest.runOnlyPendingTimersAsync();
      await promise;

      expect(logger.error).toHaveBeenCalledWith(
        "Error in replyToMentions:",
        expect.any(Error),
      );
      expect(mockScraper.sendTweet).not.toHaveBeenCalled();
    });
  });

  describe("Image Post Edge Cases", () => {
    //TODO: Bring this back when we handle banned image prompts
    // it("should handle multiple retries for image generation", async () => {
    //   const characterWithImages = {
    //     ...mockCharacter,
    //     postingBehavior: {
    //       generateImagePrompt: true,
    //       imagePromptChance: 1,
    //     },
    //   };
    //   twitterProvider = new TwitterProvider(characterWithImages);
    //
    //   const { generateImageForTweet } = require("../images");
    //   const {
    //     generateImagePromptForCharacter,
    //     handleBannedAndLengthRetries,
    //   } = require("../completions");
    //
    //   generateImagePromptForCharacter.mockResolvedValue("test prompt");
    //
    //   generateImageForTweet.mockResolvedValueOnce(
    //     Buffer.from("test image data"),
    //   );
    //
    //   const promise = twitterProvider.startTopicPosts();
    //   await jest.runOnlyPendingTimersAsync();
    //   await promise;
    //
    //   expect(handleBannedAndLengthRetries).toHaveBeenCalledWith(
    //     "test prompt",
    //     "test prompt",
    //     characterWithImages,
    //     1024,
    //     3,
    //   );
    //   expect(handleBannedAndLengthRetries).toHaveBeenCalledTimes(1);
    //   expect(generateImageForTweet).toHaveBeenCalledTimes(1);
    //   expect(mockScraper.sendTweet).toHaveBeenCalled();
    // });

    it("should handle mixed media post failures", async () => {
      const characterWithImages = {
        ...mockCharacter,
        postingBehavior: {
          generateImagePrompt: true,
          imagePromptChance: 1,
        },
      };
      twitterProvider = new TwitterProvider(characterWithImages);

      const { generateImageForTweet } = require("../images");
      generateImageForTweet.mockResolvedValueOnce(
        Buffer.from("test image data"),
      );

      // Mock API error for mixed media post
      mockScraper.sendTweet
        .mockRejectedValueOnce(new Error("Media upload failed"))
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              data: {
                create_tweet: {
                  tweet_results: {
                    result: {
                      rest_id: "fallback-text-only-tweet",
                    },
                  },
                },
              },
            }),
        });

      await twitterProvider.startTopicPosts();

      expect(generateImageForTweet).toHaveBeenCalled();
      expect(mockScraper.sendTweet).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        "Error sending tweet with image:",
        expect.any(Error),
      );
    });
  });
});
