import {
  getLastMessages,
  formatChatHistoryForPrompt,
  Platform,
  ChatMessage,
} from "../database/chat-history";

interface ContextOptions {
  platform: Platform;
  channelId?: string;
  chatId?: string;
  sessionId?: string;
  userId?: string;
  numMessages?: number;
}

export const getChatHistory = (options: ContextOptions): string => {
  // Validate required IDs based on platform
  switch (options.platform) {
    case "discord":
      if (!options.channelId)
        throw new Error("Channel ID required for Discord context");
      break;
    case "telegram":
      if (!options.chatId)
        throw new Error("Chat ID required for Telegram context");
      break;
    case "cli":
      if (!options.sessionId)
        throw new Error("Session ID required for CLI context");
      break;
  }

  const messages: ChatMessage[] = getLastMessages({
    platform: options.platform,
    channelId: options.channelId,
    chatId: options.chatId,
    sessionId: options.sessionId,
    userId: options.userId,
    limit: options.numMessages,
  });

  const chatHistory = formatChatHistoryForPrompt(messages);

  return chatHistory;
};
