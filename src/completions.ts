import OpenAI from "openai";

import { Character } from "./characters";
import { logger } from "./logger";
import {
  IMAGE_GENERATION_PROMPT_MS2,
  IS_REPLY_FUD_PROMPT,
  REPLY_GUY_PROMPT,
  REPLY_GUY_PROMPT_SHORT,
  REPLY_GUY_PROMPT_TELEGRAM,
  REVERSE_FUD_TO_SHILL_PROMPT,
  TOPIC_PROMPT,
  WAS_PROMPT_BANNED,
} from "./prompts";

export const openai = new OpenAI({
  baseURL: process.env["LLM_PROVIDER_URL"] || "",
  apiKey: process.env["LLM_PROVIDER_API_KEY"] || "",
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
  telegramRules: string;
}

const generatePrompt = (
  context: PromptContext,
  isTelegram: boolean,
  inputTweetLength: number,
) => {
  if (isTelegram) {
    const basePrompt =
      inputTweetLength <= 20
        ? REPLY_GUY_PROMPT_SHORT
        : REPLY_GUY_PROMPT_TELEGRAM;

    return context.knowledge
      ? replaceTemplateVariables(
          `# Knowledge\n{{knowledge}}\n\n${basePrompt}`,
          context,
        )
      : replaceTemplateVariables(basePrompt, context);
  }

  const basePrompt =
    inputTweetLength <= 20 ? REPLY_GUY_PROMPT_SHORT : REPLY_GUY_PROMPT;

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
        username: character.username,
        agentName: character.agentName,
        bio: character.bio.join("\n"),
        lore: character.lore.join("\n"),
        postDirections: character.postDirections.join("\n"),
        knowledge: character.knowledge || "",
        originalPost: prompt,
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
  isTelegram: boolean = false,
) => {
  let model = character.model;
  if (isTelegram) {
    model = character.postingBehavior.telegramModel || character.model;
  }
  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: character.temperature,
    });

    if (!completion.choices[0]?.message?.content) {
      throw new Error("No completion content received from API");
    }

    return completion.choices[0].message.content;
  } catch (error) {
    logger.error("Error generating completion:", error);
    throw error; // Re-throw to handle it in the calling function
  }
};

export const handleBannedAndLengthRetries = async (
  prompt: string,
  reply: string,
  character: Character,
  maxLength: number = 280,
  banThreshold: number = 3,
) => {
  let currentReply = reply;
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
        currentReply = await generateCompletionForCharacter(prompt, character);
        character.model = originalModel; // Restore original model
        break;
      }
    } else {
      logger.info(`The content was too long (>${maxLength})! Going again.`);
    }

    currentReply = await generateCompletionForCharacter(prompt, character);
    wasBanned = await checkIfPromptWasBanned(currentReply, character);
  }

  return currentReply;
};

// Rules:
// if inputTweet.length <= 20, use REPLY_GUY_PROMPT_SHORT
// if character.removePeriods, then remove periods
// if character.onlyKeepFirstSentence, then only keep first sentence
// After generating a reply, determine if the reply is fudding a token. If so, shill the token instead.
export const generateReply = async (
  inputTweet: string,
  character: Character,
  isTelegram: boolean = false,
) => {
  try {
    if (isTelegram) {
      forceCharacterToReplyOneLiners(character);
    }

    const context = {
      agentName: character.agentName,
      username: character.username,
      bio: character.bio
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .join("\n"),
      lore: character.lore
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .join("\n"),
      postDirections: character.postDirections.join("\n"),
      originalPost: inputTweet,
      knowledge: character.knowledge || "",
      telegramRules: character.postingBehavior.telegramRules?.join("\n") || "",
    };

    const prompt = generatePrompt(context, isTelegram, inputTweet.length);
    let reply = await generateCompletionForCharacter(
      prompt,
      character,
      isTelegram,
    );

    // Add ban/length handling
    if (!isTelegram) {
      reply = await handleBannedAndLengthRetries(
        prompt,
        reply,
        character,
        280,
        3,
      );
    }

    if (!isTelegram) {
      reply = await checkAndReverseFud(reply, context, inputTweet, character);
    }

    reply = formatReply(reply, character);
    return { prompt, reply };
  } catch (error) {
    console.error("Error generating reply:", error);
    throw error;
  }
};

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
    bio: character.bio
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .join("\n"),
    lore: character.lore
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .join("\n"),
    postDirections: character.postDirections.join("\n"),
    topic,
    adjective,
  };

  let prompt = replaceTemplateVariables(TOPIC_PROMPT, context);
  let reply = await generateCompletionForCharacter(prompt, character);

  // Replace existing retry logic with new handler
  reply = await handleBannedAndLengthRetries(prompt, reply, character, 280, 3);
  reply = reply.replace(/\\n/g, "\n");

  const topicPostLog = `<b>${character.username}, topic: ${topic}, adjective: ${adjective}</b>:\n\n${reply}`;
  logger.info(topicPostLog);
  return { prompt, reply };
};

const checkIfPromptWasBanned = async (reply: string, character: Character) => {
  const context = {
    agentName: character.agentName,
    username: character.username,
    reply,
  };
  const banCheckPrompt = replaceTemplateVariables(WAS_PROMPT_BANNED, context);
  const result = await generateCompletionForCharacter(
    banCheckPrompt,
    character,
  );
  return result.trim().toUpperCase() === "YES";
};

const formatReply = (reply: string, character: Character) => {
  let formattedReply = reply.replace(/\\n/g, "\n");

  if (character.postingBehavior.removePeriods) {
    formattedReply = formattedReply.replace(/\./g, "");
  }

  if (character.postingBehavior.onlyKeepFirstSentence) {
    logger.info("Only keeping first sentence of: ", formattedReply);
    formattedReply = formattedReply.split("\n")[0];
  }

  return formattedReply;
};

function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(/{{(\w+)}}/g, (_, key) => variables[key] || "");
}

function forceCharacterToReplyOneLiners(character: Character) {
  character.postingBehavior.onlyKeepFirstSentence = true;
  character.postingBehavior.removePeriods = true;
}

const checkAndReverseFud = async (
  reply: string,
  context: PromptContext,
  inputTweet: string,
  character: Character,
) => {
  const fudContext = {
    agentName: context.agentName,
    username: context.username,
    originalPost: inputTweet,
    reply,
  };

  const fudPrompt = replaceTemplateVariables(IS_REPLY_FUD_PROMPT, fudContext);
  let isFudContent = await generateCompletionForCharacter(fudPrompt, character);

  if (isFudContent !== "YES") return reply;

  context.originalPost = reply;
  const reverseFudPrompt = replaceTemplateVariables(
    REVERSE_FUD_TO_SHILL_PROMPT,
    context,
  );
  logger.info({ reverseFudPrompt });

  let reverseFudContent = await generateCompletionForCharacter(
    reverseFudPrompt,
    character,
  );
  // Check for banned prompts in the reversed FUD content
  reverseFudContent = await handleBannedAndLengthRetries(
    reverseFudPrompt,
    reverseFudContent,
    character,
  );

  logger.info(
    `<b>FUD FOUND</b>:\n\n original reply: '${reply}'\n\n New reply: '${reverseFudContent}'`,
  );

  return reverseFudContent;
};
