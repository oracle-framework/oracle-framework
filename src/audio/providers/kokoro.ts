import { Character } from "../../characters";
import { AudioProvider, AudioResponse, KokoroAudioConfig } from "../types";
import { logger } from "../../logger";

interface SpeechRequest {
  model: string;
  input: string;
  voice: string;
  response_format: "mp3" | "wav" | "opus" | "flac";
  speed: number;
}

export class KokoroAudioProvider implements AudioProvider {
  private readonly DEFAULT_BASE_URL = "http://localhost:8880";

  async generateAudio(
    text: string,
    character: Character,
  ): Promise<AudioResponse> {
    const config = character.audioGenerationBehavior
      ?.kokoro as KokoroAudioConfig;
    if (!config?.voice) {
      throw new Error("Voice is not configured for Kokoro provider");
    }

    const payload: SpeechRequest = {
      model: "kokoro", // Fixed model for Kokoro provider
      input: text,
      voice: config.voice,
      response_format: "opus",
      speed: config.speed || 1.1,
    };

    logger.info("Generating Kokoro audio for text:", text);

    const baseUrl = config.baseUrl || this.DEFAULT_BASE_URL;
    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  }
}
