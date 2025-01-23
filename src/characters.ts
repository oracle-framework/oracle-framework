import fs from "fs";
import path from "path";

import { ImageProviderType, MS2Config } from "./images/types";

export type CharacterPostingBehavior = {
  replyInterval?: number; // if set, post a reply every <replyInterval> seconds instead of REPLY_INTERVAL
  topicInterval?: number; // if set, post a topic post every <topicInterval> seconds instead of TOPIC_POST_INTERVAL
  lowerBoundPostingInterval?: number; // needed if topicInterval is set, lower bound of random interval
  upperBoundPostingInterval?: number; // needed if topicInterval is set, upper bound of random interval
  removePeriods?: boolean; // if true, remove periods (currently from replies)
  onlyKeepFirstSentence?: boolean; // if true, only keep 1st sentence in replies
  dontTweetAt?: string[]; // if set, don't tweet at these users
  telegramRules?: string[]; // if set, follow these rules when posting to telegram
  telegramModel?: string; // if set, use this model when posting to telegram
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

export type VoiceBehavior = {
  voice: string;
};

export type Character = {
  agentName: string;
  twitterUserName: string; // keep it all lowercase
  twitterPassword: string;
  telegramApiKey: string;
  bio: string[];
  lore: string[];
  postDirections: string[];
  topics?: string[];
  adjectives?: string[];
  knowledge?: string; // insert knowledge into the prompt
  telegramBotUsername?: string; // not the tag but the username of the bot
  discordBotUsername?: string; // not the tag but the username of the bot
  discordApiKey?: string; // the api key for the bot
  internalName: string; // internal name for the character
  postingBehavior: CharacterPostingBehavior;
  model: string;
  fallbackModel: string;
  temperature: number;
  imageGenerationBehavior?: ImageGenerationBehavior;
  voiceBehavior?: VoiceBehavior;
};

function loadCharacterConfigs(): Character[] {
  const charactersDir = path.join(__dirname, "characters");
  const characterFiles = fs
    .readdirSync(charactersDir)
    .filter(file => file.endsWith(".json"));

  return characterFiles.map(file => {
    const config = require(path.join(charactersDir, file));
    const internalName = config.internalName.toUpperCase();

    // Add environment variables
    return {
      ...config,
      twitterPassword:
        process.env[`AGENT_${internalName}_TWITTER_PASSWORD`] || "",
      telegramApiKey:
        process.env[`AGENT_${internalName}_TELEGRAM_API_KEY`] || "",
      imageGenerationBehavior:
        config.imageGenerationBehavior?.provider === "ms2"
          ? {
              ...config.imageGenerationBehavior,
              ms2: {
                ...config.imageGenerationBehavior.ms2,
                apiKey: process.env[`AGENT_${internalName}_MS2_API_KEY`] || "",
              },
            }
          : config.imageGenerationBehavior,
    };
  });
}

// Load all characters
export const CHARACTERS = loadCharacterConfigs();
