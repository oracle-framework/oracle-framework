import { Character } from "../../characters";
import { AudioProvider, AudioResponse, OpenAIAudioConfig } from "../types";
import { logger } from "../../logger";

export class OpenAIAudioProvider implements AudioProvider {
  private readonly DEFAULT_BASE_URL = "https://api.openai.com";

  async generateAudio(
    text: string,
    character: Character,
  ): Promise<AudioResponse> {
    const config = character.audioGenerationBehavior
      ?.openai as OpenAIAudioConfig;
    if (!config?.apiKey) {
      throw new Error("OpenAI API key not configured for this character");
    }
    if (!config.voice) {
      throw new Error("Voice is not configured for OpenAI provider");
    }

    logger.info("Generating OpenAI audio for text:", text);

    const baseUrl = config.baseUrl || this.DEFAULT_BASE_URL;
    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || "tts-1",
        input: text,
        voice: config.voice,
        response_format: "opus",
        speed: config.speed || 1.0,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  }
}
