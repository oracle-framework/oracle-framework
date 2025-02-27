// Load environment first
import { config } from "./config/env";

// Then load logger and other imports
import { logger } from "./logger";
import { Command } from "commander";
import * as commander from "commander";
import { buildServer, startServer } from "./server";
import { FastifyInstance } from "fastify";
import { setupRoutes } from "./routes";
import { CliProvider } from "./socialmedia/cli";
import { DiscordProvider } from "./socialmedia/discord";
import { TelegramProvider } from "./socialmedia/telegram";
import { TwitterProvider } from "./socialmedia/twitter";
import { getCharacters, initializeCharacters } from "./characters/index";

// Test logging levels
logger.debug("Debug log test");
logger.info("Info log test");

// Initialize characters after environment variables are loaded
const CHARACTERS = initializeCharacters();

// Initialize server
let server: FastifyInstance;

async function startTelegramBots() {
  // Start Telegram bots for characters that have API keys configured
  const characters = getCharacters();
  for (const character of characters) {
    if (character.telegramApiKey) {
      try {
        logger.info(`Auto-starting Telegram bot for ${character.username}`);
        const telegramProvider = TelegramProvider.getInstance(character);
        telegramProvider.start();
      } catch (error) {
        logger.error(
          `Failed to auto-start Telegram bot for ${character.username}:`,
          error,
        );
      }
    }
  }
}

async function startDiscordBots() {
  // Start Discord bots for characters that have API keys configured
  const characters = getCharacters();
  for (const character of characters) {
    if (character.discordApiKey) {
      try {
        logger.info(`Auto-starting Discord bot for ${character.username}`);
        const discordProvider = DiscordProvider.getInstance(character);
        await discordProvider.start();
      } catch (error) {
        logger.error(
          `Failed to auto-start Discord bot for ${character.username}:`,
          error,
        );
      }
    }
  }
}

// Function to periodically log active Discord bots
function startDiscordStatusMonitoring() {
  const logActiveDiscordBots = () => {
    const activeBots = DiscordProvider.getActiveBots();
    logger.info(`Currently active Discord bots: ${activeBots.length}`);
    activeBots.forEach(bot => {
      logger.info(`- Active Discord bot: ${bot}`);
    });
  };

  // Log initially and then every 5 minutes
  logActiveDiscordBots();
  return setInterval(logActiveDiscordBots, 5 * 60 * 1000);
}

async function startApp() {
  try {
    server = await buildServer();
    await setupRoutes(server);
    await startServer(server);

    // Auto-start bots if API keys are present
    if (process.env["AGENT_TELEGRAM_API_KEY"]) {
      await startTelegramBots();
    }
    if (process.env["AGENT_DISCORD_API_KEY"]) {
      await startDiscordBots();
      // Start monitoring Discord bot status
      startDiscordStatusMonitoring();
    }
  } catch (err) {
    logger.error({ err }, "Failed to start server:");
    if (err instanceof Error) {
      logger.error({ message: err.message }, "Error details");
      logger.error({ stack: err.stack }, "Stack trace");
    }
    process.exit(1);
  }
}

// CLI Program
const program = new Command();

program.enablePositionalOptions();

program
  .name("oracle")
  .description("CLI to manage social media agents")
  .version("0.0.1");

// Make server the default command
program
  .command("server", { isDefault: true })
  .description("Start the API server")
  .option("-p, --port <number>", "Port to run the server on", "3000")
  .action(async options => {
    const port = parseInt(options.port);
    await startApp();
  });

const characterNames = CHARACTERS.map(c => c.username);

program
  .command("telegram")
  .description("Start Telegram bot for an agent")
  .addArgument(
    new commander.Argument("<username>", "Username of the agent").choices(
      characterNames,
    ),
  )
  .action(async username => {
    const character = CHARACTERS.find(x => x.username === username);
    if (!character) {
      throw new Error(`Character not found: ${username}`);
    }
    const telegramProvider = TelegramProvider.getInstance(character);
    telegramProvider.start();
  });

program
  .command("cli")
  .description("Start CLI interface for an agent")
  .addArgument(
    new commander.Argument("<username>", "Username of the agent").choices(
      characterNames,
    ),
  )
  .action(async username => {
    const character = CHARACTERS.find(x => x.username === username);
    if (!character) {
      throw new Error(`Character not found: ${username}`);
    }
    const cliProvider = new CliProvider(character);
    cliProvider.start();
  });

program
  .command("discord")
  .description("Start Discord bot for an agent")
  .argument("<username>", "Username of the agent")
  .action(async username => {
    const character = CHARACTERS.find(x => x.username === username);
    if (!character) {
      throw new Error(`Character not found: ${username}`);
    }
    const discordProvider = DiscordProvider.getInstance(character);
    await discordProvider.start();
  });

// Add a debug command to show active Discord bots
program
  .command("discord-status")
  .description("Show all active Discord bot connections")
  .action(async () => {
    const activeBots = DiscordProvider.getActiveBots();
    console.log(`Currently active Discord bots: ${activeBots.length}`);
    if (activeBots.length > 0) {
      console.log("Active Discord bots:");
      activeBots.forEach(bot => {
        console.log(`- ${bot}`);
      });
    } else {
      console.log("No active Discord bots found.");
    }
  });

// Add a command to stop Discord bots
program
  .command("discord-stop")
  .description("Stop Discord bot for an agent")
  .argument("[username]", "Username of the agent (leave empty to stop all)")
  .action(async username => {
    if (username) {
      // Stop specific bot
      const character = CHARACTERS.find(x => x.username === username);
      if (!character) {
        throw new Error(`Character not found: ${username}`);
      }
      console.log(`Stopping Discord bot for ${username}...`);
      const provider = DiscordProvider.getInstance(character);
      await provider.stop();
      console.log(`Discord bot for ${username} stopped.`);
    } else {
      // Stop all bots
      const activeBots = DiscordProvider.getActiveBots();
      console.log(`Stopping all ${activeBots.length} active Discord bots...`);

      for (const botName of activeBots) {
        const character = CHARACTERS.find(x => x.username === botName);
        if (character) {
          const provider = DiscordProvider.getInstance(character);
          await provider.stop();
          console.log(`Discord bot for ${botName} stopped.`);
        }
      }

      console.log("All Discord bots stopped.");
    }
  });

program
  .command("autoResponder")
  .description("Start auto-responder for Twitter")
  .argument("<username>", "Username of the agent")
  .action(async username => {
    const character = CHARACTERS.find(x => x.username === username);
    if (!character) {
      throw new Error(`Character not found: ${username}`);
    }
    const twitterProvider = await TwitterProvider.getInstance(character);
    await twitterProvider.startAutoResponder();
  });

program
  .command("topicPost")
  .description("Start topic posting for Twitter")
  .argument("<username>", "Username of the agent")
  .action(async username => {
    const character = CHARACTERS.find(x => x.username === username);
    if (!character) {
      throw new Error(`Character not found: ${username}`);
    }
    const twitterProvider = await TwitterProvider.getInstance(character);
    await twitterProvider.startTopicPosts();
  });

program
  .command("replyToMentions")
  .description("Start replying to Twitter mentions")
  .argument("<username>", "Username of the agent")
  .action(async username => {
    const character = CHARACTERS.find(x => x.username === username);
    if (!character) {
      throw new Error(`Character not found: ${username}`);
    }
    const twitterProvider = await TwitterProvider.getInstance(character);
    await twitterProvider.startReplyingToMentions();
  });

program.parse();
