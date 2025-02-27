import { Client, GatewayIntentBits, Message } from "discord.js";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { logger } from "../logger";
import { saveChatMessage } from "../database/chat-history";
import { getChatHistory } from "../utils/prompt-context";

export class DiscordProvider {
  private client: Client;
  private character: Character;
  private active: boolean = false;
  private connectPromise: Promise<void> | null = null;

  // Track instances and connection status globally
  private static instances: Map<string, DiscordProvider> = new Map();
  private static activeConnections: Set<string> = new Set();
  private static connectionLock: Map<string, Promise<void>> = new Map();

  // Factory method to get or create an instance
  public static getInstance(character: Character): DiscordProvider {
    const username = character.username;

    if (!this.instances.has(username)) {
      logger.info(`Creating new Discord provider instance for ${username}`);
      this.instances.set(username, new DiscordProvider(character));
    } else {
      logger.info(`Reusing existing Discord provider instance for ${username}`);
    }

    return this.instances.get(username)!;
  }

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

  public async start(): Promise<void> {
    const username = this.character.username;

    // Check if already globally connected before proceeding
    if (DiscordProvider.activeConnections.has(username)) {
      logger.warn(
        `Discord bot for ${username} is already globally active, skipping start`,
      );
      return;
    }

    // Check if there's already a connection attempt in progress
    if (DiscordProvider.connectionLock.has(username)) {
      logger.warn(
        `Discord bot for ${username} is currently being started by another process, waiting...`,
      );
      try {
        // Wait for the existing connection attempt to complete
        await DiscordProvider.connectionLock.get(username);
        return; // If we get here, the bot is already started
      } catch (error) {
        // Previous connection attempt failed, we can try again
        logger.error(
          `Previous connection attempt for ${username} failed, trying again`,
        );
      }
    }

    // Create a lock to prevent concurrent start attempts
    this.connectPromise = this.connectToDiscord();
    DiscordProvider.connectionLock.set(username, this.connectPromise);

    try {
      await this.connectPromise;
      // Lock is released but kept in the map to indicate this bot is connected
      logger.info(`Discord bot for ${username} successfully started`);
    } catch (error) {
      // If connection fails, remove the lock so future attempts can try again
      DiscordProvider.connectionLock.delete(username);
      throw error;
    }
  }

  // Separate method to handle the actual connection logic
  private async connectToDiscord(): Promise<void> {
    if (this.active) {
      logger.info(
        `Discord bot for ${this.character.username} is already running in this instance`,
      );
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const username = this.character.username;

      // Set up event handlers
      this.client.once("ready", () => {
        this.active = true;
        DiscordProvider.activeConnections.add(username);
        logger.info(`Logged in as ${this.client.user?.tag}!`);
        resolve();
      });

      this.client.once("error", error => {
        logger.error(`Discord connection error for ${username}:`, error);
        this.active = false;
        DiscordProvider.activeConnections.delete(username);
        reject(error);
      });

      // Set up message handling
      this.client.on("messageCreate", message => this.handleMessage(message));

      // Attempt to login
      logger.info(`Attempting to log in Discord bot for ${username}`);
      this.client.login(this.character.discordApiKey).catch(error => {
        logger.error(`Failed to login Discord bot for ${username}:`, error);
        this.active = false;
        DiscordProvider.activeConnections.delete(username);
        reject(error);
      });
    });
  }

  public async stop() {
    const username = this.character.username;

    // Log details about the current state
    logger.info(`Attempting to stop Discord bot for ${username}`);
    logger.info(
      `Bot active status: ${this.active}, isReady: ${this.client.isReady()}`,
    );
    logger.info(
      `Current active connections: ${Array.from(DiscordProvider.activeConnections).join(", ")}`,
    );

    // Always clean up static references regardless of active status
    DiscordProvider.activeConnections.delete(username);
    DiscordProvider.connectionLock.delete(username);

    try {
      // Force disconnect from Discord if client exists and is ready
      if (this.client) {
        logger.info(`Destroying Discord client for ${username}`);

        // Remove all listeners to prevent any further processing
        this.client.removeAllListeners();

        // Destroy the client connection
        await this.client.destroy();
        logger.info(`Discord client destroyed for ${username}`);
      }

      // Set instance as inactive
      this.active = false;

      // Remove from instances map to allow recreation if needed
      DiscordProvider.instances.delete(username);

      logger.info(`Discord bot fully stopped for ${username}`);
      return true;
    } catch (error) {
      logger.error(`Error stopping Discord bot for ${username}:`, error);

      // Still mark as inactive even if there was an error
      this.active = false;
      DiscordProvider.instances.delete(username);

      // Re-throw the error for the caller to handle
      throw error;
    }
  }

  public isActive(): boolean {
    const username = this.character.username;

    // Check both local state and global connection tracking
    const locallyActive = this.active && this.client.isReady();
    const globallyActive = DiscordProvider.activeConnections.has(username);

    logger.debug(
      `Discord bot ${username} activity check: locally active: ${locallyActive}, globally active: ${globallyActive}`,
    );

    // If there's a mismatch between local and global state, log a warning
    if (locallyActive !== globallyActive) {
      logger.warn(
        `Discord bot ${username} has inconsistent state: local=${locallyActive}, global=${globallyActive}`,
      );

      // If locally active but not in global registry, fix the global registry
      if (locallyActive && !globallyActive) {
        logger.warn(`Fixing global registry by adding ${username}`);
        DiscordProvider.activeConnections.add(username);
      }

      // If not locally active but in global registry, clean up global registry
      if (!locallyActive && globallyActive) {
        logger.warn(`Fixing global registry by removing ${username}`);
        DiscordProvider.activeConnections.delete(username);
      }
    }

    // Bot is active if it's active locally (instance is active and client is ready)
    return locallyActive;
  }

  public getConnectedServers(): string[] {
    if (!this.client.isReady()) {
      return [];
    }
    return Array.from(this.client.guilds.cache.values()).map(
      guild => guild.name,
    );
  }

  // Static method to get all active bots
  public static getActiveBots(): string[] {
    return Array.from(this.activeConnections);
  }
}
