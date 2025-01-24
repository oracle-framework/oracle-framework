import * as readline from "readline";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { logger } from "../logger";

export class CliProvider {
  private character: Character;
  private rl: readline.Interface;

  constructor(character: Character) {
    this.character = character;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async handleUserInput(input: string) {
    try {
      const completion = await generateReply(input, this.character, true);

      console.log(`\n${this.character.username}: ${completion.reply}\n`);
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  public start() {
    logger.info(`CLI provider started for ${this.character.username}`);
    console.log(
      `Starting chat with ${this.character.username}. Type your messages and press Enter. (Ctrl+C to quit)\n`,
    );

    this.rl.on("line", async input => {
      await this.handleUserInput(input);
    });

    this.rl.on("close", () => {
      console.log("\nGoodbye!");
      process.exit(0);
    });
  }
}
