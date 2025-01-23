import { Bot, InputFile } from "grammy";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { generateAudio } from "../audio";
import { logger } from "../logger";

export class TelegramProvider {
  private bot: Bot;
  private character: Character;

  constructor(character: Character) {
    if (!character.telegramApiKey) {
      throw new Error(
        `No Telegram API key found for ${character.internalName}`,
      );
    }
    this.character = character;
    this.bot = new Bot(character.telegramApiKey);
  }

  private async handleReply(ctx: any) {
    logger.info(
      `***CALLING replyGuy for ${ctx.from?.username} at ${new Date().toLocaleString()}***`,
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

      const isAudio = ctx.msg.text?.toLowerCase().includes("audio");
      let cleanedMessage = telegramMessageToReplyTo;
      if (isAudio && this.character.audioGenerationBehavior?.provider) {
        cleanedMessage = telegramMessageToReplyTo
          .toLowerCase()
          .replace("audio", "");
      }

      const completion = await generateReply(
        cleanedMessage,
        this.character,
        true,
      );

      await this.sendResponse(ctx, completion.reply, isAudio);
      await this.maybeSendSticker(ctx);
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  private async sendResponse(ctx: any, reply: string, isAudio: boolean) {
    if (isAudio && this.character.audioGenerationBehavior?.provider) {
      const audioCompletion = await generateAudio(reply, this.character);
      if (audioCompletion) {
        const audioBuffer = await audioCompletion.arrayBuffer();
        const audioUint8Array = new Uint8Array(audioBuffer);
        await ctx.api.sendVoice(
          ctx.chatId,
          new InputFile(audioUint8Array, "audio.ogg"),
          {
            reply_parameters: { message_id: ctx.msg.message_id },
          },
        );
      } else {
        // If no audio was generated, fall back to text response
        await ctx.reply(reply, {
          reply_parameters: { message_id: ctx.msg.message_id },
        });
      }
    } else {
      await ctx.reply(reply, {
        reply_parameters: { message_id: ctx.msg.message_id },
      });
    }
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
        await ctx.replyWithSticker(randomSticker);
      } else {
        logger.error(
          "No sticker files found for character",
          this.character.internalName,
        );
      }
    }
  }

  private async handlePromptGen(ctx: any) {
    let telegramMessageToReplyTo = ctx.msg.text;
    if (!telegramMessageToReplyTo) {
      logger.error("No message text found");
      return;
    }
    const completion = await generateReply(
      telegramMessageToReplyTo.replace("promptgen", ""),
      this.character,
      false,
    );
    await ctx.reply(completion.reply);
  }

  public start() {
    logger.info(`Telegram bot started for ${this.character.internalName}`);

    this.bot.on("message", async ctx => {
      const chatId = ctx.chatId;
      const text = ctx.msg.text;

      if (
        text?.includes(this.character.telegramBotUsername || "") ||
        ctx.message?.reply_to_message?.from?.username ===
          this.character.telegramBotUsername
      ) {
        logger.info(`Bot was mentioned in chat ${chatId}: ${text}`);
        await this.handleReply(ctx);
      } else if (
        ctx.from?.username == "teeasma" &&
        text?.includes("promptgen")
      ) {
        await this.handlePromptGen(ctx);
      }
    });

    this.bot.start();
  }
}
