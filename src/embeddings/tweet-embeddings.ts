import { db } from "../database/db";
import { generateEmbedding as embedText } from "./embedder";
import { logger } from "../logger";

interface TweetRow {
  tweet_id: string;
  tweet_text: string;
  tweet_text_embedding: Buffer;
}

export async function storeTweetEmbedding(
  username: string,
  tweetId: string,
  tweetText: string,
  tweetTextSummary: string,
  tweetedAt: string,
) {
  try {
    const tweetTextEmbedding = await embedText(tweetText);
    const tweetTextSummaryEmbedding = await embedText(tweetTextSummary);

    const textBuffer = Buffer.from(new Float32Array(tweetTextEmbedding).buffer);
    const summaryBuffer = Buffer.from(
      new Float32Array(tweetTextSummaryEmbedding).buffer,
    );

    db.prepare(
      `
      INSERT INTO vector_tweets (
        username, 
        tweet_id, 
        tweet_text, 
        tweet_text_summary, 
        tweeted_at, 
        tweet_text_embedding, 
        tweet_text_summary_embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      username,
      tweetId,
      tweetText,
      tweetTextSummary,
      tweetedAt,
      textBuffer,
      summaryBuffer,
    );

    logger.info(`Stored embedding for tweet ${tweetId}`);
  } catch (error) {
    logger.error("Error storing tweet embedding:", error);
    throw error;
  }
}

function decodeEmbedding(buffer: Buffer): number[] {
  return Array.from(new Float32Array(buffer.buffer));
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (normA * normB);
}

export async function isTweetTooSimilar(
  newTweet: string,
  threshold = 0.5,
  numResults = 5,
): Promise<boolean> {
  try {
    const newEmbedding = await embedText(newTweet);
    const newBuffer = Buffer.from(new Float32Array(newEmbedding).buffer);

    const query = `
      SELECT tweet_id, tweet_text, tweet_text_embedding 
      FROM vector_tweets
      ORDER BY vec_distance_L2(tweet_text_embedding, ?) ASC
      LIMIT ?
    `;

    logger.debug(
      {
        newTweetLength: newTweet.length,
        embeddingLength: newEmbedding.length,
        threshold,
        numResults,
      },
      "Checking tweet similarity",
    );

    const rows = db.prepare(query).all(newBuffer, numResults) as TweetRow[];

    if (!rows.length) {
      logger.debug("No previous tweets to compare against");
      return false;
    }

    const newEmbeddingArray = Array.from(newEmbedding);
    for (const row of rows) {
      const pastEmbedding = decodeEmbedding(row.tweet_text_embedding);
      const similarity = cosineSimilarity(newEmbeddingArray, pastEmbedding);

      if (similarity >= threshold) {
        logger.info(
          `Tweet ${row.tweet_id} is too similar (Similarity: ${similarity})`,
        );
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error({ error }, "Error checking tweet similarity");
    return false;
  }
}
