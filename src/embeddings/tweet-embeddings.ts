import { db } from "../database";
import { generateEmbedding } from "./embedder";
import { logger } from "../logger";

export async function storeTweetEmbedding(
  username: string,
  tweetId: string,
  tweetText: string,
  tweetSummary: string,
  timestamp: string,
) {
  try {
    const embedding = await generateEmbedding(tweetSummary);
    const embeddingArray = Array.from(embedding);

    if (embeddingArray.length !== 384) {
      throw new Error(
        `Embedding size mismatch: expected 384, got ${embeddingArray.length}`,
      );
    }

    const stmt = db.prepare(`
      INSERT INTO vector_tweets (username, tweet_id, tweet_text, tweet_summary, embedding, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(username, tweetId, tweetText, tweetSummary, embeddingArray.join(","), timestamp);
    logger.info(`Stored embedding for tweet ${tweetId}`);
  } catch (error) {
    logger.error("Error storing tweet embedding:", error);
    throw error;
  }
}

export async function isTweetTooSimilar(
  tweetText: string,
  similarityThreshold: number = 0.85,
): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(tweetText);
    const embeddingArray = Array.from(embedding);

    if (embeddingArray.length !== 384) {
      throw new Error(
        `Embedding size mismatch: expected 384, got ${embeddingArray.length}`,
      );
    }

    const stmt = db.prepare(`
      SELECT tweet_text, cosine_similarity(embedding, ?) as similarity
      FROM vector_tweets
      WHERE similarity > ?
      LIMIT 1
    `);

    const result = stmt.get(embeddingArray.join(","), similarityThreshold);
    return !!result;
  } catch (error) {
    logger.error("Error checking tweet similarity:", error);
    return false;
  }
}
