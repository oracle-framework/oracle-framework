import dotenv from "dotenv";
import { Command } from "commander";
import * as commander from "commander";

// Load environment variables at startup
dotenv.config();

import { CHARACTERS } from "./characters/index";
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

const characterNames = CHARACTERS.map(c => c.username);

program
  .command("generateCookies")
  .description("Generate Twitter cookies for an agent")
  .argument("<username>", "Username of the agent")
  .action(async username => {
    const character = CHARACTERS.find(x => x.username === username);
    if (!character) {
      throw new Error(`Character not found: ${username}`);
    }
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.login();
  });

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
    const telegramProvider = new TelegramProvider(character);
    await telegramProvider.start();
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
    const discordProvider = new DiscordProvider(character);
    await discordProvider.start();
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
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.initWithCookies();
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
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.initWithCookies();
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
    const twitterProvider = new TwitterProvider(character);
    await twitterProvider.initWithCookies();
    await twitterProvider.startReplyingToMentions();
  });

program.parse();
