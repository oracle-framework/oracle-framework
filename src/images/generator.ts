import { Character } from "../characters";
import { logger } from "../logger";
import { MS2ImageProvider } from "./providers/ms2";
import { ImageProvider } from "./types";

const providers: Record<string, ImageProvider> = {
  ms2: new MS2ImageProvider(),
};

export async function generateImageForTweet(
  imagePrompt: string,
  character: Character,
): Promise<Buffer> {
  const provider =
    providers[character.imageGenerationBehavior?.provider || "ms2"];
  if (!provider) {
    throw new Error(
      `Image provider not found: ${character.imageGenerationBehavior?.provider}`,
    );
  }

  logger.info(
    "Using image provider:",
    character.imageGenerationBehavior?.provider,
  );
  return await provider.generateImage(imagePrompt, character);
}
