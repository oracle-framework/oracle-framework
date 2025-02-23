import { Bot, InputFile } from "grammy";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { generateAudio } from "../audio";
import { logger } from "../logger";
import { saveChatMessage } from "../database/chat-history";
import { getChatHistory } from "../utils/prompt-context";

export class TelegramProvider {
  private static instances: Map<string, TelegramProvider> = new Map();
  private bot: Bot;
  private character: Character;
  private active: boolean = false;
  private activeChats: Set<string> = new Set();
  private messageHandler: ((ctx: any) => Promise<void>) | null = null;

  private constructor(character: Character) {
    if (!character.telegramApiKey) {
      throw new Error(`No Telegram API key found for ${character.username}`);
    }
    this.character = character;
    this.bot = new Bot(character.telegramApiKey);
    this.messageHandler = null;
  }

  public static getInstance(character: Character): TelegramProvider {
    const key = character.username;
    if (!TelegramProvider.instances.has(key)) {
      const provider = new TelegramProvider(character);
      TelegramProvider.instances.set(key, provider);
    }
    return TelegramProvider.instances.get(key)!;
  }

  public start() {
    if (this.active) {
      logger.info(
        `Telegram provider already running for ${this.character.username}`,
      );
      return;
    }

    logger.info(`Telegram provider started for ${this.character.username}`);
    this.active = true;

    // Define message handler if not already defined
    if (!this.messageHandler) {
      this.messageHandler = this.handleReply.bind(this);
      this.bot.on("message", this.messageHandler);
    }

    this.bot.start();
  }

  public async stop() {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.messageHandler = null;

    // Stop the bot and remove all listeners
    await this.bot.stop();

    // Create a new bot instance to ensure clean slate
    this.bot = new Bot(this.character.telegramApiKey);

    logger.info(`Telegram provider stopped for ${this.character.username}`);
  }

  public async cleanup() {
    await this.stop();
    TelegramProvider.instances.delete(this.character.username);
  }

  public isActive(): boolean {
    return this.active;
  }

  public getActiveChats(): string[] {
    return Array.from(this.activeChats);
  }

  private async handleReply(ctx: any) {
    // Add chat to active chats when receiving a message
    if (ctx.chat?.id) {
      this.activeChats.add(ctx.chat.id.toString());
    }
    logger.debug(
      `replying to ${ctx.from?.username} at ${new Date().toLocaleString()}`,
    );
    try {
      let telegramMessageToReplyTo = ctx.msg.text;
      if (
        !telegramMessageToReplyTo ||
        telegramMessageToReplyTo.length === 0 ||
        !ctx.from?.username
      ) {
        logger.error("No message text found or username is empty");
        return;
      }

      if (
        ctx.chat.type === "private" ||
        ctx.msg.text?.includes(this.character.telegramBotUsername) ||
        ctx.message?.reply_to_message?.from?.username ===
          this.character.telegramBotUsername
      ) {
        // Save user's message
        saveChatMessage({
          platform: "telegram",
          platform_channel_id: ctx.chat.id.toString(),
          platform_message_id: ctx.msg.message_id.toString(),
          platform_user_id: ctx.from.id.toString(),
          username: ctx.from.username,
          message_content: telegramMessageToReplyTo,
          message_type: "text",
          is_bot_response: 0,
        });

        const isAudio = ctx.msg.text?.toLowerCase().includes("!audio");
        let cleanedMessage = telegramMessageToReplyTo;
        if (isAudio && this.character.audioGenerationBehavior?.provider) {
          cleanedMessage = telegramMessageToReplyTo
            .toLowerCase()
            .replace("!audio", "");
        }

        const chatHistory = getChatHistory({
          platform: "telegram",
          chatId: ctx.chat.id.toString(),
          userId: ctx.from.id.toString(),
        });

        const completion = await generateReply(
          cleanedMessage,
          this.character,
          true,
          chatHistory,
        );

        await this.sendResponse(ctx, completion.reply, isAudio);
        await this.maybeSendSticker(ctx);
      }
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  private async sendResponse(ctx: any, reply: string, isAudio: boolean) {
    try {
      if (isAudio && this.character.audioGenerationBehavior?.provider) {
        const audioCompletion = await generateAudio(reply, this.character);
        if (audioCompletion) {
          const audioBuffer = await audioCompletion.arrayBuffer();
          const audioUint8Array = new Uint8Array(audioBuffer);
          const sentMessage = await ctx.api.sendVoice(
            ctx.chatId,
            new InputFile(audioUint8Array, "audio.ogg"),
            {
              reply_parameters: { message_id: ctx.msg.message_id },
            },
          );

          // Save audio message to history
          await saveChatMessage({
            platform: "telegram",
            platform_channel_id: ctx.chat.id.toString(),
            platform_message_id: sentMessage.message_id.toString(),
            platform_user_id: this.bot.botInfo?.id.toString(),
            username: this.character.username,
            message_content: reply,
            message_type: "voice",
            metadata: {
              duration: sentMessage.voice?.duration,
              file_size: sentMessage.voice?.file_size,
            },
            is_bot_response: 1,
          });
        } else {
          // Fallback to text response
          const sentMessage = await ctx.reply(reply, {
            reply_parameters: { message_id: ctx.msg.message_id },
          });

          await this.saveTextResponse(ctx, sentMessage, reply);
        }
      } else {
        const sentMessage = await ctx.reply(reply, {
          reply_parameters: { message_id: ctx.msg.message_id },
        });

        await this.saveTextResponse(ctx, sentMessage, reply);
      }
    } catch (error) {
      logger.error("Error sending response:", error);
      throw error;
    }
  }

  private async saveTextResponse(ctx: any, sentMessage: any, reply: string) {
    await saveChatMessage({
      platform: "telegram",
      platform_channel_id: ctx.chat.id.toString(),
      platform_message_id: sentMessage.message_id.toString(),
      platform_user_id: this.bot.botInfo?.id.toString(),
      username: this.character.username,
      message_content: reply,
      message_type: "text",
      is_bot_response: 1,
    });
  }

  private async maybeSendSticker(ctx: any) {
    if (
      Math.random() < (this.character.postingBehavior.stickerChance || 0.01)
    ) {
      if (this.character.postingBehavior.stickerFiles) {
        const randomSticker =
          this.character.postingBehavior.stickerFiles[
            Math.floor(
              Math.random() *
                this.character.postingBehavior.stickerFiles.length,
            )
          ];

        const sentSticker = await ctx.replyWithSticker(randomSticker);

        // Save sticker to history
        await saveChatMessage({
          platform: "telegram",
          platform_channel_id: ctx.chat.id.toString(),
          platform_message_id: sentSticker.message_id.toString(),
          platform_user_id: this.bot.botInfo?.id.toString(),
          username: this.character.username,
          message_content: randomSticker,
          message_type: "sticker",
          metadata: {
            sticker_id: randomSticker,
            set_name: sentSticker.sticker?.set_name,
            emoji: sentSticker.sticker?.emoji,
          },
          is_bot_response: 1,
        });
      } else {
        logger.error(
          "No sticker files found for character",
          this.character.username,
        );
      }
    }
  }
}
