import { db } from "./index";

export type Platform = "discord" | "telegram" | "cli";
export type MessageType =
  | "text"
  | "sticker"
  | "image"
  | "voice"
  | "video"
  | "action";

export interface ChatMessage {
  platform: Platform;
  platform_channel_id?: string;
  platform_message_id?: string;
  platform_user_id?: string;
  username?: string;
  session_id?: string;
  message_content: string;
  message_type: MessageType;
  metadata?: Record<string, any>;
  is_bot_response: number;
  prompt?: string;
  created_at?: string;
}

export const saveChatMessage = (message: ChatMessage) => {
  const metadata = message.metadata ? JSON.stringify(message.metadata) : null;

  const stmt = db.prepare(`
    INSERT INTO chat_messages (
      platform, platform_channel_id, platform_message_id, 
      platform_user_id, username, session_id,
      message_content, message_type, metadata,
      is_bot_response, prompt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const result = stmt.run(
    message.platform,
    message.platform_channel_id || null,
    message.platform_message_id || null,
    message.platform_user_id || null,
    message.username || null,
    message.session_id || null,
    message.message_content,
    message.message_type,
    metadata,
    message.is_bot_response,
    message.prompt || null,
  );

  return result;
};

interface GetMessagesOptions {
  platform: Platform;
  channelId?: string;
  chatId?: string;
  sessionId?: string;
  userId?: string;
  limit?: number;
}

export const getLastMessages = (options: GetMessagesOptions): ChatMessage[] => {
  const platformId =
    options.platform === "telegram"
      ? options.chatId
      : options.platform === "discord"
        ? options.channelId
        : options.sessionId;

  let query = `
    SELECT * FROM chat_messages 
    WHERE platform = ? AND (
      CASE 
        WHEN platform = 'telegram' THEN platform_channel_id = ?
        WHEN platform = 'discord' THEN platform_channel_id = ?
        ELSE session_id = ?
      END
    )`;

  const params = [options.platform, platformId, platformId, platformId];

  // Add user_id filter if provided
  if (options.userId) {
    query += ` AND (platform_user_id = ? OR is_bot_response = 1)`;
    params.push(options.userId);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(String(options.limit || 10));

  const results = db.prepare(query).all(...params) as any[];

  // Parse metadata JSON for each message
  return results.map(msg => ({
    ...msg,
    metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined,
  }));
};

export const formatChatHistoryForPrompt = (messages: ChatMessage[]): string => {
  return messages
    .reverse()
    .map(msg => {
      const role = msg.is_bot_response ? "Assistant" : "User";
      let content = msg.message_content;

      // Add context about the message type and metadata if present
      if (msg.message_type !== "text") {
        if (msg.message_type === "sticker") {
          content = `[Sent sticker: ${msg.message_content}]`;
        } else if (msg.message_type === "action") {
          content = `[${msg.message_content}]`;
        } else {
          content = `[Sent ${msg.message_type}: ${msg.message_content}]`;
        }

        // Add relevant metadata to the context
        if (msg.metadata) {
          const metadataStr = Object.entries(msg.metadata)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ");
          content += ` (${metadataStr})`;
        }
      }

      return `${role}: ${content}`;
    })
    .join("\n");
};
