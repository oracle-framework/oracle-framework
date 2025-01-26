import { Client, GatewayIntentBits, Message } from "discord.js";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { logger } from "../logger";
import { saveChatMessage } from "../database/chat-history";
import { getChatHistory } from "../utils/prompt-context";

export class DiscordProvider {
  private client: Client;
  private character: Character;

  constructor(character: Character) {
    if (!character.discordApiKey) {
      throw new Error(`No Discord API key found for ${character.username}`);
    }
    if (!character.discordBotUsername) {
      throw new Error(
        `No Discord bot username found for ${character.username}`,
      );
    }

    this.character = character;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  private async handleMessage(message: Message) {
    if (message.author.bot) return;
    if (!this.character.discordBotUsername) return;

    const text = message.content;
    if (message.mentions.users.has(this.character.discordBotUsername)) {
      logger.info(`Bot was mentioned in channel ${message.channelId}: ${text}`);
      try {
        // Save user's message
        saveChatMessage({
          platform: "discord",
          platform_channel_id: message.channelId,
          platform_message_id: message.id,
          platform_user_id: message.author.id,
          username: message.author.username,
          message_content: text,
          message_type: "text",
          is_bot_response: 0,
        });

        // Get chat history for this user in this channel
        const chatHistory = getChatHistory({
          platform: "discord",
          channelId: message.channelId,
          userId: message.author.id,
        });

        // Generate reply with chat history context
        const completion = await generateReply(
          text,
          this.character,
          true,
          chatHistory,
        );

        logger.debug("LLM completion done.");

        // Send the reply
        const reply = await message.reply(completion.reply);

        // Save bot's response
        saveChatMessage({
          platform: "discord",
          platform_channel_id: message.channelId,
          platform_message_id: reply.id,
          platform_user_id: this.client.user?.id,
          username: this.character.username,
          message_content: completion.reply,
          message_type: "text",
          is_bot_response: 1,
          prompt: completion.prompt,
        });
      } catch (e: any) {
        logger.error(`There was an error: ${e}`);
        logger.error("e.message", e.message);
      }
    }
  }

  public async start() {
    this.client.once("ready", () => {
      logger.info(`Logged in as ${this.client.user?.tag}!`);
    });

    this.client.on("messageCreate", message => this.handleMessage(message));

    await this.client.login(this.character.discordApiKey);
    logger.info(`Discord bot started for ${this.character.username}`);
  }

  public async stop() {
    await this.client.destroy();
    logger.info(`Discord bot stopped for ${this.character.username}`);
  }
}
