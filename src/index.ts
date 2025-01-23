import { Command } from "commander";
import * as commander from "commander";
import dotenv from "dotenv";

import { CHARACTERS } from "./characters";
import { logger } from "./logger";
import { CliProvider } from "./socialmedia/cli";
import { DiscordProvider } from "./socialmedia/discord";
import { TelegramProvider } from "./socialmedia/telegram";
import { TwitterProvider } from "./socialmedia/twitter";

// Load environment variables at startup
dotenv.config();

const program = new Command();

program.enablePositionalOptions();

program
  .name("daos-world-agent")
  .description("CLI to manage social media agents")
  .version("0.0.1");

const characterNames = CHARACTERS.map(c => c.internalName);

program
  .command("generateCookies")
  .description("Generate Twitter cookies for an agent")
  .argument("<internalName>", "Internal name of the agent")
  .action(async internalName => {
    const character = CHARACTERS.find(x => x.internalName === internalName);
    if (!character) {
      logger.error(`No agent found for ${internalName}`);
      process.exit(1);
    }
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.login();
  });

program
  .command("listenToTelegram")
  .description("Start Telegram bot for an agent")
  .addArgument(
    new commander.Argument(
      "<internalName>",
      "Internal name of the agent",
    ).choices(characterNames),
  )
  .action(async internalName => {
    const character = CHARACTERS.find(x => x.internalName === internalName);
    if (!character) {
      logger.error(`No agent found for ${internalName}`);
      process.exit(1);
    }
    const telegramProvider = new TelegramProvider(character);
    telegramProvider.start();
  });

program
  .command("cli")
  .description("Start CLI interface for an agent")
  .addArgument(
    new commander.Argument(
      "<internalName>",
      "Internal name of the agent",
    ).choices(characterNames),
  )
  .action(async internalName => {
    const character = CHARACTERS.find(x => x.internalName === internalName);
    if (!character) {
      logger.error(`No agent found for ${internalName}`);
      process.exit(1);
    }
    // const telegramProvider = new TelegramProvider(character);
    // telegramProvider.start();
    const cliProvider = new CliProvider(character);
    cliProvider.start();
  });

program
  .command("listenToDiscord")
  .description("Start Discord bot for an agent")
  .argument("<internalName>", "Internal name of the agent")
  .action(async internalName => {
    const character = CHARACTERS.find(x => x.internalName === internalName);
    if (!character) {
      logger.error(`No agent found for ${internalName}`);
      process.exit(1);
    }
    const discordProvider = new DiscordProvider(character);
    await discordProvider.start();
  });

program
  .command("autoResponder")
  .description("Start auto-responder for Twitter")
  .argument("<internalName>", "Internal name of the agent")
  .action(async internalName => {
    const character = CHARACTERS.find(x => x.internalName === internalName);
    if (!character) {
      logger.error(`No agent found for ${internalName}`);
      process.exit(1);
    }
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.initWithCookies();
    await twitterProvider.startAutoResponder();
  });

program
  .command("topicPost")
  .description("Start topic posting for Twitter")
  .argument("<internalName>", "Internal name of the agent")
  .action(async internalName => {
    const character = CHARACTERS.find(x => x.internalName === internalName);
    if (!character) {
      throw new Error(`Character not found: ${internalName}`);
    }
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.initWithCookies();
    await twitterProvider.startTopicPosts();
  });

program
  .command("replyToMentions")
  .description("Start replying to Twitter mentions")
  .argument("<internalName>", "Internal name of the agent")
  .action(async internalName => {
    const character = CHARACTERS.find(x => x.internalName === internalName);
    if (!character) {
      logger.error(`No agent found for ${internalName}`);
      process.exit(1);
    }
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.initWithCookies();
    await twitterProvider.startReplyingToMentions();
  });

program.parse();
