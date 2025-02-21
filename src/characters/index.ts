import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { logger } from "../logger";
import { ImageProviderType, MS2Config } from "../images/types";
import {
  AudioProviderType,
  OpenAIAudioConfig,
  KokoroAudioConfig,
} from "../audio/types";

export type CharacterPostingBehavior = {
  replyInterval?: number; // if set, post a reply every <replyInterval> seconds instead of REPLY_INTERVAL
  topicInterval?: number; // if set, post a topic post every <topicInterval> seconds instead of TOPIC_POST_INTERVAL
  lowerBoundPostingInterval?: number; // needed if topicInterval is set, lower bound of random interval
  upperBoundPostingInterval?: number; // needed if topicInterval is set, upper bound of random interval
  removePeriods?: boolean; // if true, remove periods (currently from replies)
  onlyKeepFirstSentence?: boolean; // if true, only keep 1st sentence in replies
  dontTweetAt?: string[]; // if set, don't tweet at these users
  chatModeRules?: string[]; // if set, follow these rules when in chat mode (telegram, discord, CLI)
  chatModeModel?: string; // if set, use this model when in chat mode
  shouldIgnoreTwitterReplies?: boolean; // if true, ignore replies when searching for mentions
  generateImagePrompt?: boolean; // if true, generate an image prompt for the post
  imagePromptChance?: number; // if generateImagePrompt is true, generate an image prompt for the post this percentage of the time
  stickerChance?: number; // send a sticker after posting this percentage of the time
  stickerFiles?: string[]; // if stickerChance is true, send one of these stickers
};

export type ImageGenerationBehavior = {
  provider: ImageProviderType;
  imageGenerationPromptModel?: string;
  ms2?: MS2Config;
};

export type AudioGenerationBehavior = {
  provider: AudioProviderType;
  openai?: OpenAIAudioConfig;
  kokoro?: KokoroAudioConfig;
};

export type Character = {
  agentName: string;
  userIdStr: string;
  username: string; // keep it all lowercase
  twitterPassword: string;
  twitterEmail?: string;
  telegramApiKey: string;
  bio: string[];
  lore: string[];
  postDirections: string[];
  topics?: string[];
  adjectives?: string[];
  knowledge?: string[]; // insert knowledge into the prompt
  telegramBotUsername?: string; // not the tag but the username of the bot
  discordBotUsername?: string; // not the tag but the username of the bot
  discordApiKey?: string; // the api key for the bot
  postingBehavior: CharacterPostingBehavior;
  model: string;
  fallbackModel: string;
  temperature: number;
  imageGenerationBehavior?: ImageGenerationBehavior;
  audioGenerationBehavior?: AudioGenerationBehavior;
};

let CHARACTERS: Character[] = [];

function loadCharacterConfigs(): Character[] {
  // Ensure environment variables are loaded
  dotenv.config();

  logger.info("Starting to load character configs...");
  const characterFile = fs.readFileSync(
    path.join(__dirname, "characters.json"),
    "utf8",
  );
  logger.info("Read characters.json file");
  const configs = JSON.parse(characterFile);

  // Ensure configs is an array
  if (!Array.isArray(configs)) {
    throw new Error(
      "characters.json must contain an array of character configurations",
    );
  }

  // Debug log for environment variables
  logger.info("Environment variables state:");
  logger.info(
    `AGENT_TELEGRAM_API_KEY: ${process.env.AGENT_TELEGRAM_API_KEY ? "present" : "missing"}`,
  );
  logger.info(
    `AGENT_TWITTER_PASSWORD: ${process.env.AGENT_TWITTER_PASSWORD ? "present" : "missing"}`,
  );
  logger.info(
    `AGENT_TWITTER_EMAIL: ${process.env.AGENT_TWITTER_EMAIL ? "present" : "missing"}`,
  );
  logger.info(
    `AGENT_DISCORD_API_KEY: ${process.env.AGENT_DISCORD_API_KEY ? "present" : "missing"}`,
  );

  // Add environment variables to each character config
  return configs.map(config => {
    const telegramApiKey = process.env.AGENT_TELEGRAM_API_KEY || "";
    logger.info(`Processing character ${config.username}:`);
    logger.info(
      `- Telegram API key: ${telegramApiKey ? "present" : "missing"}`,
    );

    return {
      ...config,
      twitterPassword: process.env.AGENT_TWITTER_PASSWORD || "",
      twitterEmail: process.env.AGENT_TWITTER_EMAIL || "",
      telegramApiKey,
      discordApiKey: process.env.AGENT_DISCORD_API_KEY || "",
      discordBotUsername: config.discordBotUsername,
      imageGenerationBehavior:
        config.imageGenerationBehavior?.provider === "ms2"
          ? {
              ...config.imageGenerationBehavior,
              ms2: {
                ...config.imageGenerationBehavior.ms2,
                apiKey: process.env.AGENT_MS2_API_KEY || "",
              },
            }
          : config.imageGenerationBehavior,
      audioGenerationBehavior:
        config.audioGenerationBehavior?.provider === "openai"
          ? {
              ...config.audioGenerationBehavior,
              openai: {
                ...config.audioGenerationBehavior.openai,
                apiKey: process.env.AGENT_OPENAI_API_KEY || "",
              },
            }
          : config.audioGenerationBehavior,
    };
  });
}

// Initialize characters
export function initializeCharacters() {
  CHARACTERS = loadCharacterConfigs();
  return CHARACTERS;
}

// Export getter for characters
export function getCharacters(): Character[] {
  if (CHARACTERS.length === 0) {
    return initializeCharacters();
  }
  return CHARACTERS;
}
