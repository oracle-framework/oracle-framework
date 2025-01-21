import { Client, GatewayIntentBits, Message } from "discord.js";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { logger } from "../logger";

export class DiscordProvider {
  private client: Client;
  private character: Character;

  constructor(character: Character) {
    if (!character.discordApiKey) {
      throw new Error(`No Discord API key found for ${character.internalName}`);
    }
    if (!character.discordBotUsername) {
      throw new Error(
        `No Discord bot username found for ${character.internalName}`,
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
        const completion = await generateReply(text, this.character, true);
        logger.info("LLM completion done.");
        await message.reply(completion.reply);
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
    logger.info(`Discord bot started for ${this.character.internalName}`);
  }

  public async stop() {
    await this.client.destroy();
    logger.info(`Discord bot stopped for ${this.character.internalName}`);
  }
}
