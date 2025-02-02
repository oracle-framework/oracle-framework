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
import { generateReply } from "../completions";

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
  handleBannedAndLengthRetries: jest
    .fn()
    .mockResolvedValue("Test image prompt"),
  generateImagePromptForCharacter: jest
    .fn()
    .mockResolvedValue("Test image prompt"),
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
  });
});
