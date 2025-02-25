import { jest } from "@jest/globals";
import { Database } from "better-sqlite3";
import { logger } from "../logger";
import { db } from "../database/db";
import {
  saveTweet,
  getTweetById,
  getUserInteractionCount,
} from "../database/tweets";
import { Tweet } from "../database/types";

jest.mock("../logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Twitter Database Operations", () => {
  let testDb: Database;

  beforeEach(() => {
    jest.clearAllMocks();
    testDb = db;
    // Make sure the schema is properly initialized
    const vectorTableExists = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tweets'",
      )
      .get();

    // Check if the character_id_str column exists
    if (vectorTableExists) {
      const columnInfo = testDb
        .prepare("PRAGMA table_info(tweets)")
        .all()
        .map((col: any) => col.name);

      if (!columnInfo.includes("character_id_str")) {
        // The tweets table exists but doesn't have character_id_str column
        // This indicates we need to recreate the table with the proper schema
        testDb.prepare("DROP TABLE tweets").run();
        testDb.exec(`
          CREATE TABLE tweets (
            id_str VARCHAR(50) NOT NULL,              
            user_id_str VARCHAR(50) NOT NULL,         
            user_screen_name VARCHAR(20) NOT NULL,    
            full_text TEXT NOT NULL,                  
            conversation_id_str VARCHAR(50) NOT NULL, 
            tweet_created_at DATETIME NOT NULL,
            in_reply_to_status_id_str VARCHAR(50),    
            in_reply_to_user_id_str VARCHAR(50),      
            in_reply_to_screen_name VARCHAR(20),
            character_id_str VARCHAR(50) NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_tweets_id_str ON tweets(id_str);
          CREATE INDEX IF NOT EXISTS idx_tweets_user_id_str ON tweets(user_id_str);
          CREATE INDEX IF NOT EXISTS idx_tweets_conversation_id_str ON tweets(conversation_id_str);
          CREATE INDEX IF NOT EXISTS idx_tweets_tweet_created_at ON tweets(tweet_created_at);
          CREATE INDEX IF NOT EXISTS idx_tweets_in_reply_to_status_id_str ON tweets(in_reply_to_status_id_str);
          CREATE INDEX IF NOT EXISTS idx_tweets_in_reply_to_user_id_str ON tweets(in_reply_to_user_id_str);
          CREATE INDEX IF NOT EXISTS idx_tweets_character_id_str ON tweets(character_id_str);
        `);
      }
    }

    // Use a transaction for better test isolation
    const transaction = testDb.transaction(() => {
      testDb.prepare("DELETE FROM tweets").run();
    });
    transaction();
  });

  describe("saveTweet", () => {
    it("should handle missing required fields", async () => {
      const invalidTweet = {
        idStr: "", // intentionally empty to test validation
        tweetCreatedAt: new Date().toISOString(),
        fullText: "", // also empty to match error message
        userIdStr: "user123",
        userScreenName: "", // missing but required
        conversationIdStr: "23452435",
        inReplyToStatusIdStr: "1234567890",
        inReplyToUserIdStr: "", // not required field
        inReplyToScreenName: "", // not required field
        characterIdStr: "characterId",
      };

      const errorMsg =
        'Missing required fields for tweet: {"idStr":true,"userIdStr":false,"userScreenName":true,"fullText":true,"conversationIdStr":false,"tweetCreatedAt":false,"characterIdStr":false}';
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
        idStr: "1234567890",
        userIdStr: "user123",
        userScreenName: "testuser",
        fullText: "test input",
        conversationIdStr: "23452435",
        tweetCreatedAt: new Date().toISOString(),
        inReplyToStatusIdStr: "1234567890",
        inReplyToUserIdStr: "user123",
        inReplyToScreenName: "testuser",
        characterIdStr: "characterId",
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

      const result = getTweetById("characterId", "nonexistent");
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
        INSERT INTO tweets (
          id_str,
          user_id_str,
          user_screen_name,
          full_text,
          conversation_id_str,
          tweet_created_at,
          in_reply_to_status_id_str,
          in_reply_to_user_id_str,
          in_reply_to_screen_name,
          character_id_str
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

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
        "characterId",
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
        "characterId",
      );

      const count = getUserInteractionCount(
        "characterId",
        "999444555000333",
        2 * 60 * 60 * 1000,
      );
      expect(count).toBe(1);
    });

    it("should handle database errors", () => {
      jest.spyOn(testDb, "prepare").mockImplementationOnce(() => {
        throw new Error("Database error");
      });

      const count = getUserInteractionCount(
        "characterId",
        "243523423452435",
        3600000,
      );
      expect(count).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
