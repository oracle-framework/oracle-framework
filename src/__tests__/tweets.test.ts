import { jest } from "@jest/globals";
import { Database } from "better-sqlite3";
import { logger } from "../logger";
import { db } from "../database/db";
import {
  saveTweet,
  getTweetById,
  getTwitterHistory,
  getUserInteractionCount,
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
        id_str: "", // intentionally empty to test validation
        tweet_created_at: new Date().toISOString(),
        full_text: "", // also empty to match error message
        user_id_str: "user123",
        conversation_id_str: "23452435",
        in_reply_to_status_id_str: "1234567890",
        in_reply_to_user_id_str: "", // not required field
        in_reply_to_screen_name: "", // not required field
      };

      const errorMsg =
        'Missing required fields for tweet: {"id_str":true,"user_id_str":false,"user_screen_name":true,"full_text":true,"conversation_id_str":false,"tweet_created_at":false}';
      expect(() => saveTweet(invalidTweet as Tweet)).toThrow(errorMsg);
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
        id_str: "1234567890",
        user_id_str: "user123",
        user_screen_name: "testuser",
        full_text: "test input",
        conversation_id_str: "23452435",
        tweet_created_at: new Date().toISOString(),
        in_reply_to_status_id_str: "1234567890",
        in_reply_to_user_id_str: "user123",
        in_reply_to_screen_name: "testuser",
      };

      expect(() => saveTweet(tweet)).toThrow(mockError);
      expect(logger.error).toHaveBeenCalledWith(
        "Error inserting tweet:",
        expect.any(Error),
      );
    });
  });

  describe("getTweetById", () => {
    it("should handle database errors", () => {
      jest.spyOn(testDb, "prepare").mockImplementationOnce(() => {
        throw new Error("Database error");
      });

      const result = getTweetById("nonexistent");
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
          id_str,
          user_id_str,
          user_screen_name,
          full_text,
          conversation_id_str,
          tweet_created_at,
          in_reply_to_status_id_str,
          in_reply_to_user_id_str,
          in_reply_to_screen_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      stmt.run(
        "192837465748392",
        "756483928659345",
        "testuser99",
        "test tweet",
        "132344556667890",
        now.toISOString(),
        "132323452337890",
        "999444555000333",
        "testuser",
      );

      stmt.run(
        "192837465748392",
        "756483928659345",
        "testuser99",
        "test tweet",
        "132344556667890",
        hourAgo.toISOString(),
        "132323452337890",
        "243523423452435",
        "testuser",
      );

      const count = getUserInteractionCount(
        "999444555000333",
        2 * 60 * 60 * 1000,
      );
      expect(count).toBe(1);
    });

    it("should handle database errors", () => {
      jest.spyOn(testDb, "prepare").mockImplementationOnce(() => {
        throw new Error("Database error");
      });

      const count = getUserInteractionCount("243523423452435", 3600000);
      expect(count).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
