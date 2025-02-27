import { logger } from "../logger";

let pipeline: any = null;

export async function initializeEmbedder() {
  try {
    const { pipeline: transformersPipeline } = await import(
      "@xenova/transformers"
    );
    pipeline = await transformersPipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
    logger.info("Embedder initialized successfully");
  } catch (error) {
    logger.error({ error }, "Failed to initialize embedder");
    throw error;
  }
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  if (!pipeline) {
    await initializeEmbedder();
  }

  const output = await pipeline(text, { pooling: "mean", normalize: true });
  return output.data;
}
