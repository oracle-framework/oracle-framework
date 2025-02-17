import { db } from "../database/db";
import { embedText } from "./embedder";

export async function storeTweetEmbedding(
  username: string,
  tweetId: string,
  tweetText: string,
  tweetTextSummary: string,
  tweetedAt: string,
) {
  const tweetTextEmbedding = await embedText(tweetText);
  const tweetTextSummaryEmbedding = await embedText(tweetTextSummary);

  const textBuffer = Buffer.from(new Float32Array(tweetTextEmbedding).buffer);
  const summaryBuffer = Buffer.from(
    new Float32Array(tweetTextSummaryEmbedding).buffer,
  );

  db.prepare(
    `
      INSERT INTO vector_tweets (username, tweet_id, tweet_text, tweet_text_summary, tweeted_at, tweet_text_embedding, tweet_text_summary_embedding) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
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

interface TweetRow {
  tweet_id: string;
  tweet_text: string;
  tweet_text_embedding: Buffer;
}

export async function isTweetTooSimilar(
  newTweet: string,
  threshold = 0.5,
  numResults = 5,
): Promise<boolean> {
  const newEmbedding = await embedText(newTweet); // Generate embedding for the new tweet
  const newBuffer = Buffer.from(new Float32Array(newEmbedding).buffer);

  // Find closest matching tweet IDs using L2 distance
  const rows = db
    .prepare(
      `
    SELECT tweet_id, tweet_text, tweet_text_embedding FROM vector_tweets
    ORDER BY vec_distance_L2(tweet_text_embedding, ?) ASC
    LIMIT ?
  `,
    )
    .all(newBuffer, numResults) as TweetRow[];

  if (!rows.length) return false; // No past tweets to compare against

  // Check if similarity exceeds threshold
  for (const row of rows) {
    const pastEmbedding = decodeEmbedding(row.tweet_text_embedding);
    const similarity = cosineSimilarity(newEmbedding, pastEmbedding);

    if (similarity >= threshold) {
      console.log(
        `Tweet ${row.tweet_id} is too similar (Similarity: ${similarity})`,
      );
      return true;
    }
  }

  return false;
}
