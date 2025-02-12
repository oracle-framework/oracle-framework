import { jest } from "@jest/globals";
import { Database } from "better-sqlite3";
import { logger } from "../logger";
import { db } from "../database/db";
import {
  saveTweet,
  getTweetByInputTweetId,
  getTwitterHistory,
  getUserInteractionCount,
  TwitterHistory,
} from "../database/tweets";
import { Tweet } from "../socialmedia/types";
jest.mock("../logger", () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Twitter Database Operations", () => {
  let testDb: Database;

  beforeEach(() => {
    jest.clearAllMocks();
    testDb = db;
    testDb.prepare("DELETE FROM twitter_history").run();
  });

  describe("saveTweet", () => {
    it("should handle missing required fields", async () => {
      const invalidTweet = {
        input_tweet_id: "test123",
        input_tweet_created_at: new Date().toISOString(),
        input_tweet_text: "test input",
        input_tweet_user_id: "user123",
        new_tweet_id: "", // intentionally empty to test validation
        new_tweet_text: "", // also empty to match error message
        prompt: "test prompt",
      };

      const errorMsg =
        'Missing required fields for bot tweet: {"username":false,"new_tweet_id":true,"new_tweet_text":true}';
      expect(() => saveTweet("testuser", invalidTweet as Tweet)).toThrow(
        errorMsg,
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Error inserting tweet:",
        expect.any(Error),
      );
    });

    it("should handle database errors", async () => {
      const mockError = new Error("Database error");
      jest.spyOn(testDb, "prepare").mockImplementationOnce(() => {
        throw mockError;
      });

      const tweet = {
        new_tweet_id: "test123",
        new_tweet_text: "test tweet",
        input_tweet_id: "input123",
        input_tweet_user_id: "user123",
        input_tweet_username: "user123",
        input_tweet_text: "input text",
        input_tweet_created_at: new Date().toISOString(),
        prompt: "test prompt",
      };

      expect(() => saveTweet("testuser", tweet)).toThrow(mockError);
      expect(logger.error).toHaveBeenCalledWith(
        "Error inserting tweet:",
        expect.any(Error),
      );
    });
  });

  describe("getTweetByInputTweetId", () => {
    it("should handle database errors", () => {
      jest.spyOn(testDb, "prepare").mockImplementationOnce(() => {
        throw new Error("Database error");
      });

      const result = getTweetByInputTweetId("nonexistent");
      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("getUserInteractionCount", () => {
    it("should count interactions within timeout period", () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Insert test data
      const stmt = testDb.prepare(`
        INSERT INTO twitter_history (
          twitter_user_id, tweet_id, tweet_text, created_at, 
          is_bot_tweet, conversation_id, username
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);

      stmt.run(
        "bot123",
        "tweet1",
        "test tweet",
        now.toISOString(),
        1,
        "conv123",
        "testuser",
      );

      stmt.run(
        "user456",
        "tweet2",
        "reply tweet",
        hourAgo.toISOString(),
        0,
        "conv123",
        "replier",
      );

      const count = getUserInteractionCount(
        "user456",
        "bot123",
        2 * 60 * 60 * 1000,
      );
      expect(count).toBe(1);
    });

    it("should handle database errors", () => {
      jest.spyOn(testDb, "prepare").mockImplementationOnce(() => {
        throw new Error("Database error");
      });

      const count = getUserInteractionCount("user123", "bot123", 3600000);
      expect(count).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
