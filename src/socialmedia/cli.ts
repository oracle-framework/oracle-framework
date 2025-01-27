import * as readline from "readline";
import { v4 as uuidv4 } from "uuid";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { logger } from "../logger";
import { saveChatMessage, MessageType } from "../database/chat-history";
import { getChatHistory } from "../utils/prompt-context";

export class CliProvider {
  private character: Character;
  private rl: readline.Interface;
  private sessionId: string;

  constructor(character: Character) {
    this.character = character;
    this.sessionId = uuidv4();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async handleUserInput(input: string) {
    try {
      saveChatMessage({
        platform: "cli",
        session_id: this.sessionId,
        message_content: input,
        message_type: "text",
        is_bot_response: 0,
      });

      const chatHistory = getChatHistory({
        platform: "cli",
        sessionId: this.sessionId,
      });

      const completion = await generateReply(
        input,
        this.character,
        true,
        chatHistory,
      );

      const messageType: MessageType = "text";
      const messageContent = completion.reply;

      saveChatMessage({
        platform: "cli",
        session_id: this.sessionId,
        message_content: messageContent,
        message_type: messageType,
        is_bot_response: 1,
        prompt: completion.prompt,
      });

      console.log(messageContent);
    } catch (e) {
      logger.error("There was an error:", e);
      logger.error("e.message");
    }
  }

  public start() {
    logger.info(
      `CLI provider started for ${this.character.username} (Session ID: ${this.sessionId})`,
    );
    logger.info(
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
