import { pipeline } from "@xenova/transformers";

// Load the embedding model
let embedder: any;

export async function embedText(text: string): Promise<number[]> {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }

  const output = await embedder(text, { pooling: "mean", normalize: true });
  const embedding = Array.from(output.data) as number[];

  if (embedding.length !== 384) {
    throw new Error(
      `Embedding size mismatch: expected 384, got ${embedding.length}`,
    );
  }

  return embedding;
}
