import * as readline from "readline";
import { v4 as uuidv4 } from "uuid";

import { Character } from "../characters";
import { generateReply } from "../completions";
import { logger } from "../logger";
import { saveChatMessage, MessageType } from "../database/chat-history";
import { addChatHistoryToPrompt } from "../utils/prompt-context";

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
      // Save user message
      await saveChatMessage({
        platform: "cli",
        session_id: this.sessionId,
        message_content: input,
        message_type: "text",
        is_bot_response: 0
      });

      // Get prompt with chat history
      const promptWithHistory = await addChatHistoryToPrompt(input, {
        platform: "cli",
        sessionId: this.sessionId
      });

      // Generate reply with chat history context
      const completion = await generateReply(promptWithHistory, this.character, true);

      // Check if the response contains any special actions
      const hasSticker = completion.reply.includes("[STICKER]");
      const messageType: MessageType = hasSticker ? "sticker" : "text";
      let messageContent = completion.reply;
      let metadata: Record<string, any> | undefined;

      if (hasSticker) {
        // Extract sticker info if present
        const stickerMatch = completion.reply.match(/\[STICKER:([^\]]+)\]/);
        if (stickerMatch) {
          messageContent = stickerMatch[1].trim();
          metadata = { sticker_id: messageContent };
        }
      }

      // Save bot response
      await saveChatMessage({
        platform: "cli",
        session_id: this.sessionId,
        message_content: messageContent,
        message_type: messageType,
        metadata,
        is_bot_response: 1,
        prompt: promptWithHistory
      });

      // Display the response appropriately
      if (hasSticker) {
        console.log(`\n${this.character.username} sent a sticker: ${messageContent}\n`);
      } else {
        console.log(`\n${this.character.username}: ${messageContent}\n`);
      }
    } catch (e: any) {
      logger.error(`There was an error: ${e}`);
      logger.error("e.message", e.message);
    }
  }

  public start() {
    logger.info(`CLI provider started for ${this.character.username} (Session ID: ${this.sessionId})`);
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
