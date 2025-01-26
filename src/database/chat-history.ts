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

  return db
    .prepare(
      `INSERT INTO chat_messages (
        platform, platform_channel_id, platform_message_id, 
        platform_user_id, username, session_id,
        message_content, message_type, metadata,
        is_bot_response, prompt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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

  const query = `
    SELECT * FROM chat_messages 
    WHERE platform = ? AND 
    (
      CASE 
        WHEN platform = 'cli' THEN session_id = ?
        ELSE platform_channel_id = ?
      END
    )
    AND (
      -- Include messages from the specific user
      ${options.userId ? "platform_user_id = ?" : "1=1"}
      OR 
      -- Include bot responses in the same conversation thread
      (is_bot_response = 1 AND EXISTS (
        SELECT 1 FROM chat_messages user_msgs
        WHERE user_msgs.platform = chat_messages.platform
        AND user_msgs.platform_channel_id = chat_messages.platform_channel_id
        AND user_msgs.platform_user_id = ?
        AND user_msgs.is_bot_response = 0
      ))
    )
    ORDER BY created_at DESC 
    LIMIT ?
  `;

  const params = options.userId
    ? [
        options.platform,
        platformId,
        platformId,
        options.userId,
        options.userId,
        options.limit || 10,
      ]
    : [options.platform, platformId, platformId, options.limit || 10];

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
