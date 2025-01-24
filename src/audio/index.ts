import { Character } from "../characters";
import { logger } from "../logger";
import { KokoroAudioProvider } from "./providers/kokoro";
import { OpenAIAudioProvider } from "./providers/openai";
import { AudioProvider } from "./types";

const providers: Record<string, AudioProvider> = {
  kokoro: new KokoroAudioProvider(),
  openai: new OpenAIAudioProvider(),
};

export async function generateAudio(
  text: string,
  character: Character,
): Promise<Response> {
  const provider =
    providers[character.audioGenerationBehavior?.provider || "kokoro"];
  if (!provider) {
    throw new Error(
      `Audio provider not found: ${character.audioGenerationBehavior?.provider}`,
    );
  }

  logger.info(
    "Using audio provider:",
    character.audioGenerationBehavior?.provider,
  );
  return await provider.generateAudio(text, character);
}
