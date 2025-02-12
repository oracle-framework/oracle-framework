import {
  getLastMessages,
  formatChatHistoryForPrompt,
  ChatMessage,
  Platform,
} from "../database/chat-history";
import { getChatHistory } from "../utils/prompt-context";

// Mock the chat-history module
jest.mock("../database/chat-history", () => ({
  getLastMessages: jest.fn(),
  formatChatHistoryForPrompt: jest.fn(),
}));

describe("Prompt Context", () => {
  // Sample test data
  const mockMessages: ChatMessage[] = [
    {
      platform: "discord" as Platform,
      platform_channel_id: "channel123",
      platform_user_id: "user123",
      message_content: "Hello bot!",
      message_type: "text",
      is_bot_response: 0,
    },
    {
      platform: "discord" as Platform,
      platform_channel_id: "channel123",
      platform_user_id: "bot123",
      message_content: "Hi there!",
      message_type: "text",
      is_bot_response: 1,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getLastMessages as jest.Mock).mockReturnValue(mockMessages);
    (formatChatHistoryForPrompt as jest.Mock).mockReturnValue(
      "formatted history",
    );
  });

  describe("Platform Validation", () => {
    it("should throw error for Discord without channel ID", () => {
      expect(() =>
        getChatHistory({
          platform: "discord",
        }),
      ).toThrow("Channel ID required for Discord context");
    });

    it("should throw error for Telegram without chat ID", () => {
      expect(() =>
        getChatHistory({
          platform: "telegram",
        }),
      ).toThrow("Chat ID required for Telegram context");
    });

    it("should throw error for CLI without session ID", () => {
      expect(() =>
        getChatHistory({
          platform: "cli",
        }),
      ).toThrow("Session ID required for CLI context");
    });
  });

  describe("Message Retrieval", () => {
    it("should get Discord history with all parameters", () => {
      const params = {
        platform: "discord" as Platform,
        channelId: "channel123",
        userId: "user123",
        numMessages: 5,
      };

      getChatHistory(params);

      expect(getLastMessages).toHaveBeenCalledWith({
        platform: "discord",
        channelId: "channel123",
        userId: "user123",
        limit: 5,
      });
      expect(formatChatHistoryForPrompt).toHaveBeenCalledWith(mockMessages);
    });

    it("should get Telegram history with all parameters", () => {
      const params = {
        platform: "telegram" as Platform,
        chatId: "chat123",
        userId: "user123",
        numMessages: 10,
      };

      getChatHistory(params);

      expect(getLastMessages).toHaveBeenCalledWith({
        platform: "telegram",
        chatId: "chat123",
        userId: "user123",
        limit: 10,
      });
      expect(formatChatHistoryForPrompt).toHaveBeenCalledWith(mockMessages);
    });

    it("should get CLI history with all parameters", () => {
      const params = {
        platform: "cli" as Platform,
        sessionId: "session123",
        userId: "user123",
        numMessages: 15,
      };

      getChatHistory(params);

      expect(getLastMessages).toHaveBeenCalledWith({
        platform: "cli",
        sessionId: "session123",
        userId: "user123",
        limit: 15,
      });
      expect(formatChatHistoryForPrompt).toHaveBeenCalledWith(mockMessages);
    });
  });

  describe("Message Formatting", () => {
    it("should return formatted chat history", () => {
      const params = {
        platform: "discord" as Platform,
        channelId: "channel123",
      };

      const result = getChatHistory(params);

      expect(formatChatHistoryForPrompt).toHaveBeenCalledWith(mockMessages);
      expect(result).toBe("formatted history");
    });

    it("should handle empty message list", () => {
      (getLastMessages as jest.Mock).mockReturnValue([]);
      (formatChatHistoryForPrompt as jest.Mock).mockReturnValue("");

      const params = {
        platform: "discord" as Platform,
        channelId: "channel123",
      };

      const result = getChatHistory(params);

      expect(formatChatHistoryForPrompt).toHaveBeenCalledWith([]);
      expect(result).toBe("");
    });
  });

  describe("Optional Parameters", () => {
    it("should use default limit when numMessages is not provided", () => {
      const params = {
        platform: "discord" as Platform,
        channelId: "channel123",
      };

      getChatHistory(params);

      expect(getLastMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: undefined,
        }),
      );
    });

    it("should handle optional userId parameter", () => {
      const params = {
        platform: "discord" as Platform,
        channelId: "channel123",
        userId: "user123",
      };

      getChatHistory(params);

      expect(getLastMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user123",
        }),
      );
    });
  });
});
