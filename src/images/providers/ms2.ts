import { Character } from "../../characters";
import { logger } from "../../logger";
import { ImageProvider, MS2ApiResponse } from "../types";

export class MS2ImageProvider implements ImageProvider {
  async generateImage(prompt: string, character: Character): Promise<Buffer> {
    if (!character.imageGenerationBehavior?.ms2?.apiKey) {
      throw new Error("MS2 API key not configured for this character");
    }

    const enhancedPrompt = this.enhancePrompt(prompt, character);
    const imageUrl = await this.callMS2Api(enhancedPrompt, character);
    return await this.downloadImage(imageUrl);
  }

  private enhancePrompt(prompt: string, character: Character): string {
    if (!character.imageGenerationBehavior?.ms2) return prompt;

    if (
      Math.random() <
      (character.imageGenerationBehavior.ms2.cheesworldChance || 0.01)
    ) {
      prompt = "cheeseworld6 " + prompt;
    }
    if (
      Math.random() <
      (character.imageGenerationBehavior.ms2.miladyChance || 0.01)
    ) {
      prompt = "milady " + prompt;
    }
    return prompt;
  }

  private async callMS2Api(
    prompt: string,
    character: Character,
  ): Promise<string> {
    if (!character.imageGenerationBehavior?.ms2?.apiKey) {
      throw new Error("MS2 API key not configured for this character");
    }

    logger.info("Generating MS2 image for prompt:", prompt);

    const response = await fetch(
      "https://www.miladystation2.net/api/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${character.imageGenerationBehavior.ms2.apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          n: 1,
          size: "1024x1024",
          wait: true,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as MS2ApiResponse;
    if (data.error) {
      throw new Error(`Error generating image: ${data.error.message}`);
    }
    if (!data.data?.[0]?.url) {
      throw new Error(`No data returned from MS2 API`);
    }

    return data.data[0].url;
  }

  private async downloadImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
