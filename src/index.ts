import dotenv from "dotenv";
import { Command } from "commander";

// Load environment variables at startup
dotenv.config();

import { CHARACTER, Character } from "./characters";
import { logger } from "./logger";
import { CliProvider } from "./socialmedia/cli";
import { DiscordProvider } from "./socialmedia/discord";
import { TelegramProvider } from "./socialmedia/telegram";
import { TwitterProvider } from "./socialmedia/twitter";

const program = new Command();

program.enablePositionalOptions();

program
  .name("daos-world-agent")
  .description("CLI to manage social media agents")
  .version("0.0.1");

const username = CHARACTER.username;

program
  .command("generateCookies")
  .description("Generate Twitter cookies for an agent")
  .argument("<username>", "Username of the agent")
  .action(async providedName => {
    if (providedName !== username) {
      logger.error(`No agent found for ${providedName}`);
      process.exit(1);
    }
    const twitterProvider = new TwitterProvider(CHARACTER);
    await twitterProvider.login();
  });

program
  .command("telegram")
  .description("Start the Telegram bot")
  .argument("<username>", "Username of the agent")
  .action(async providedName => {
    if (providedName !== username) {
      logger.error(`No agent found for ${providedName}`);
      return;
    }
    await startTelegramBot(CHARACTER);
  });

program
  .command("twitter")
  .description("Start the Twitter bot")
  .argument("<username>", "Username of the agent")
  .action(async providedName => {
    if (providedName !== username) {
      logger.error(`No agent found for ${providedName}`);
      return;
    }
    await startTwitterBot(CHARACTER);
  });

program
  .command("discord")
  .description("Start the Discord bot")
  .argument("<username>", "Username of the agent")
  .action(async providedName => {
    if (providedName !== username) {
      logger.error(`No agent found for ${providedName}`);
      return;
    }
    await startDiscordBot(CHARACTER);
  });

program
  .command("cli")
  .description("Start the CLI bot")
  .argument("<username>", "Username of the agent")
  .action(async providedName => {
    if (providedName !== username) {
      logger.error(`No agent found for ${providedName}`);
      return;
    }
    const cli = new CliProvider(CHARACTER);
    await cli.start();
  });

program.parse();

// Helper functions for starting bots
async function startTelegramBot(character: Character) {
  const telegramProvider = new TelegramProvider(character);
  await telegramProvider.start();
}

async function startTwitterBot(character: Character) {
  const twitterProvider = new TwitterProvider(character);
  await twitterProvider.initWithCookies();
  await twitterProvider.startAutoResponder();
}

async function startDiscordBot(character: Character) {
  const discordProvider = new DiscordProvider(character);
  await discordProvider.start();
}
