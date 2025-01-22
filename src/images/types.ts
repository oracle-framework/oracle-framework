import { Character } from "../characters";

export interface ImageProvider {
  generateImage(prompt: string, character: Character): Promise<Buffer>;
}

export interface MS2Config {
  apiKey: string;
  miladyChance?: number;
  cheesworldChance?: number;
}

export interface MS2ApiResponse {
  error?: {
    message: string;
  };
  data?: Array<{
    url: string;
  }>;
}

export type ImageProviderType = "ms2" | "other_provider"; // Add more providers as needed
