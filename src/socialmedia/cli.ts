import { Character } from "../characters";
// import { generateReply } from "../completions";
import { logger } from "../logger";

export class CliProvider {
  private character: Character;

  constructor(character: Character) {
    this.character = character;
  }

  // private async handleReply(ctx: any) {
  //   logger.info(
  //     `***CALLING CLI reply for ${ctx.from?.username} at ${new Date().toLocaleString()}***`,
  //   );
  //   try {
  //     let cliMessageToReplyTo = '';
  //
  //     const completion = await generateReply(
  //       cliMessageToReplyTo,
  //       this.character,
  //     );
  //
  //     console.log(completion.reply);
  //   } catch (e: any) {
  //     logger.error(`There was an error: ${e}`);
  //     logger.error("e.message", e.message);
  //   }
  // }


  // private async handlePromptGen(ctx: any) {
  //   let telegramMessageToReplyTo = ctx.msg.text;
  //   if (!telegramMessageToReplyTo) {
  //     logger.error("No message text found");
  //     return;
  //   }
  //   const completion = await generateReply(
  //     telegramMessageToReplyTo.replace("promptgen", ""),
  //     this.character,
  //     false,
  //   );
  //   await ctx.reply(completion.reply);
  // }

  public start() {
    logger.info(`CLI provider started for ${this.character.internalName}`);
  }
}
