import { Character } from "../characters";

export interface AudioProvider {
  generateAudio(text: string, character: Character): Promise<Response>;
}

export interface OpenAIAudioConfig {
  apiKey: string;
  model?: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"; // OpenAI's supported voices
  speed?: number;
  baseUrl?: string; // Base URL for OpenAI API or compatible provider
}

export interface KokoroAudioConfig {
  apiKey?: string;
  voice?: string; // Kokoro supports custom voice IDs like "af_sky"
  speed?: number;
  baseUrl?: string; // Base URL for the Kokoro API
}

export type AudioProviderType = "openai" | "kokoro"; // Add more providers as needed

export type AudioResponse = Response; 