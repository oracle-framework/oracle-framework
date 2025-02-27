import OpenAI from "openai";

import { Character } from "./characters";
import { logger } from "./logger";
import { config } from "./config/env";
import {
  IMAGE_GENERATION_PROMPT_MS2,
  REPLY_GUY_PROMPT,
  REPLY_GUY_PROMPT_SHORT,
  PROMPT_CHAT_MODE,
  TOPIC_PROMPT,
  WAS_PROMPT_BANNED,
} from "./prompts";

logger.info("Initializing OpenAI client with:");
logger.info(`baseURL: ${config.llmProvider.url}`);
logger.info(`apiKey: ${config.llmProvider.apiKey.substring(0, 10)}...`);

export const openai = new OpenAI({
  baseURL: config.llmProvider.url,
  apiKey: config.llmProvider.apiKey,
});

const MAX_OUTPUT_TOKENS = 70;

interface PromptContext extends Record<string, string> {
  agentName: string;
  username: string;
  bio: string;
  lore: string;
  postDirections: string;
  originalPost: string;
  knowledge: string;
  chatModeRules: string;
  recentHistory: string;
}

const generatePrompt = (
  context: PromptContext,
  isChatMode: boolean,
  inputLength: number,
) => {
  if (isChatMode) {
    return context.knowledge
      ? replaceTemplateVariables(
          `# Knowledge\n{{knowledge}}\n\n${PROMPT_CHAT_MODE}`,
          context,
        )
      : replaceTemplateVariables(PROMPT_CHAT_MODE, context);
  }

  const basePrompt =
    inputLength <= 20 ? REPLY_GUY_PROMPT_SHORT : REPLY_GUY_PROMPT;

  return context.knowledge
    ? replaceTemplateVariables(
        `# Knowledge\n{{knowledge}}\n\n${basePrompt}`,
        context,
      )
    : replaceTemplateVariables(basePrompt, context);
};

export async function generateImagePromptForCharacter(
  prompt: string,
  character: Character,
): Promise<string> {
  logger.info("Generating image prompt for character:", character.agentName);

  let imagePrompt;
  switch (character.imageGenerationBehavior?.provider) {
    case "ms2":
      imagePrompt = replaceTemplateVariables(IMAGE_GENERATION_PROMPT_MS2, {
        agentName: character.agentName,
        bio: character.bio.join("\n"),
        lore: character.lore.join("\n"),
        postDirections: character.postDirections.join("\n"),
        knowledge: character.knowledge?.join("\n") || "",
        originalPost: prompt,
        username: character.username,
      });
      break;
    default:
      throw new Error(
        `Unsupported image provider: ${character.imageGenerationBehavior?.provider}`,
      );
  }

  try {
    const completion = await openai.chat.completions.create({
      model:
        character.imageGenerationBehavior?.imageGenerationPromptModel ||
        character.model,
      messages: [{ role: "user", content: imagePrompt }],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: character.temperature,
    });

    if (!completion.choices[0]?.message?.content) {
      throw new Error("No completion content received from API");
    }

    return completion.choices[0].message.content;
  } catch (error) {
    logger.error("Error generating image prompt:", error);
    throw error;
  }
}

const generateCompletionForCharacter = async (
  prompt: string,
  character: Character,
  isChatMode: boolean = false,
  userPrompt: string,
) => {
  let model = character.model;
  if (isChatMode) {
    model = character.postingBehavior.chatModeModel || character.model;
  }
  logger.debug({ userPrompt }, "userPrompt");
  const completion = await openai.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: isChatMode ? 300 : MAX_OUTPUT_TOKENS,
    temperature: character.temperature,
  });

  if (!completion.choices?.[0]?.message?.content) {
    throw new Error(
      `No content in API response: ${JSON.stringify(completion)}`,
    );
  }

  return completion.choices[0].message.content;
};

/**
 * Sometimes the LLM completions say that the prompt was banned for inappropriate use.
 * Retry the prompt <banThreshold> number of times, if still fail, then use
 * fallback mode.
 * @param prompt
 * @param generatedReply
 * @param character
 * @param maxLength
 * @param banThreshold
 * @param inputMessage
 */
export const handleBannedAndLengthRetries = async (
  prompt: string,
  generatedReply: string,
  character: Character,
  maxLength: number = 280,
  banThreshold: number = 3,
  inputMessage: string,
) => {
  let currentReply = generatedReply;
  let banCount = 0;
  let wasBanned = await checkIfPromptWasBanned(currentReply, character);

  while (wasBanned || currentReply.length > maxLength) {
    if (wasBanned) {
      banCount++;
      logger.info(`The prompt was banned! Attempt ${banCount}/${banThreshold}`);

      // Use fallback model after threshold attempts
      if (banCount >= banThreshold && character.fallbackModel) {
        logger.info("Switching to fallback model:", character.fallbackModel);
        const originalModel = character.model;
        character.model = character.fallbackModel;
        currentReply = await generateCompletionForCharacter(
          prompt,
          character,
          false,
          inputMessage,
        );
        character.model = originalModel; // Restore original model
        break;
      }
    } else {
      logger.info(`The content was too long (>${maxLength})! Going again.`);
    }

    currentReply = await generateCompletionForCharacter(
      prompt,
      character,
      false,
      inputMessage,
    );
    wasBanned = await checkIfPromptWasBanned(currentReply, character);
  }

  return currentReply;
};

// Rules:
// if inputTweet.length <= 20, use REPLY_GUY_PROMPT_SHORT
// if character.removePeriods, then remove periods
// if character.onlyKeepFirstSentence, then only keep first sentence
export const generateReply = async (
  inputMessage: string,
  character: Character,
  isChatMode: boolean = false,
  recentHistory?: string,
) => {
  try {
    const context = {
      agentName: character.agentName,
      username: character.username,
      bio: character.bio.join("\n"),
      lore: character.lore.join("\n"),
      postDirections: character.postDirections.join("\n"),
      originalPost: inputMessage,
      knowledge: character.knowledge?.join("\n") || "",
      chatModeRules: character.postingBehavior.chatModeRules?.join("\n") || "",
      recentHistory: recentHistory || "",
    };

    const prompt = generatePrompt(context, isChatMode, inputMessage.length);

    logger.debug(prompt);

    let reply = await generateCompletionForCharacter(
      prompt,
      character,
      isChatMode,
      inputMessage,
    );

    logger.debug(reply);

    // Add ban/length handling
    if (!isChatMode) {
      reply = await handleBannedAndLengthRetries(
        prompt,
        reply,
        character,
        280,
        3,
        inputMessage,
      );
    }

    reply = formatReply(reply, character);
    return { prompt, reply };
  } catch (error) {
    console.error("Error generating reply:", error);
    throw error;
  }
};

/**
 * Write a "topic post", which is a post on twitter. Will select a random topic
 * from character.topics.
 * @param character
 * @param recentHistory
 */
export const generateTopicPost = async (character: Character) => {
  const topic = character
    .topics!.sort(() => Math.random() - 0.5)
    .slice(0, 1)[0];
  const adjective = character
    .adjectives!.sort(() => Math.random() - 0.5)
    .slice(0, 1)[0];
  const context = {
    agentName: character.agentName,
    username: character.username,
    bio: character.bio.join("\n"),
    lore: character.lore.join("\n"),
    postDirections: character.postDirections.join("\n"),
  };

  const userPrompt = `Generate a post that is ${adjective} about ${topic}`;

  let prompt = replaceTemplateVariables(TOPIC_PROMPT, context);
  let reply = await generateCompletionForCharacter(
    prompt,
    character,
    false,
    userPrompt,
  );

  reply = await handleBannedAndLengthRetries(
    prompt,
    reply,
    character,
    280,
    3,
    userPrompt,
  );
  reply = reply.replace(/\\n/g, "\n");

  const topicPostLog = `<b>${character.username}, topic: ${topic}, adjective: ${adjective}</b>:\n\n${reply}`;
  logger.info(topicPostLog);
  return { prompt, reply };
};

const checkIfPromptWasBanned = async (reply: string, character: Character) => {
  const context = {
    agentName: character.agentName,
    username: character.username,
  };
  const banCheckPrompt = replaceTemplateVariables(WAS_PROMPT_BANNED, context);
  const result = await generateCompletionForCharacter(
    banCheckPrompt,
    character,
    false,
    reply,
  );
  return result.trim().toUpperCase() === "YES";
};

const formatReply = (reply: string, character: Character) => {
  let formattedReply = reply.replace(/\\n/g, "\n");

  if (character.postingBehavior.removePeriods) {
    formattedReply = formattedReply.replace(/\./g, "");
  }

  if (character.postingBehavior.onlyKeepFirstSentence) {
    formattedReply = formattedReply.split("\n")[0];
  }

  logger.debug(`Formatted reply: ${formattedReply}`);

  return formattedReply;
};

function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(/{{(\w+)}}/g, (_, key) => variables[key] || "");
}

export const generateTweetSummary = async (
  character: Character,
  tweetText: string,
) => {
  const prompt = `<SYSTEM_TASK>Summarize this tweet into 1-2 sentences</SYSTEM_TASK>`;

  const completion = await openai.chat.completions.create({
    model: character.model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: tweetText },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: character.temperature,
  });

  if (!completion.choices?.[0]?.message?.content) {
    throw new Error(
      `No content in API response: ${JSON.stringify(completion)}`,
    );
  }

  return completion.choices[0].message.content;
};
