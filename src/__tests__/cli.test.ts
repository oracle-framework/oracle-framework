import { CliProvider } from "../socialmedia/cli";
import { Character } from "../characters";
import { generateReply } from "../completions";
import { logger } from "../logger";
import * as readline from "readline";
import { ChatMessage } from "../database/chat-history";
import { db } from "../database/db";

jest.mock("../completions", () => ({
  generateReply: jest.fn(),
}));

jest.mock("../logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockOn = jest.fn();
const mockClose = jest.fn();
const mockInterface = {
  on: mockOn,
  close: mockClose,
};

jest.mock("readline", () => ({
  createInterface: jest.fn(() => mockInterface),
}));

describe("CliProvider", () => {
  let cliProvider: CliProvider;
  let mockCharacter: Character;

  beforeEach(() => {
    db.prepare("DELETE FROM chat_messages").run();
    jest.clearAllMocks();

    mockCharacter = {
      agentName: "Test Agent",
      username: "test_agent",
      userIdStr: "123456789",
      twitterPassword: "password123",
      telegramApiKey: "telegram_api_key",
      bio: ["Test bio"],
      lore: ["Test lore"],
      postDirections: ["Test directions"],
      postingBehavior: {
        generateImagePrompt: false,
      },
      model: "gpt-4",
      fallbackModel: "gpt-3.5-turbo",
      temperature: 0.7,
    };

    (readline.createInterface as unknown as jest.Mock).mockImplementation(
      () => mockInterface,
    );
    cliProvider = new CliProvider(mockCharacter);
  });

  describe("start", () => {
    it("should initialize correctly and set up event listeners", () => {
      cliProvider.start();

      expect(readline.createInterface).toHaveBeenCalled();
      expect(mockOn).toHaveBeenCalledWith("line", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("close", expect.any(Function));
    });

    it("should handle user input and generate responses", async () => {
      (generateReply as jest.Mock).mockResolvedValue({
        prompt: "Test prompt",
        reply: "Test reply",
      });

      cliProvider.start();
      const onLineCallback = mockOn.mock.calls.find(
        call => call[0] === "line",
      )[1];

      await onLineCallback("Hello bot");

      const messages = db
        .prepare("SELECT * FROM chat_messages")
        .all() as ChatMessage[];
      expect(messages).toHaveLength(2);
      expect(messages[0].message_content).toBe("Hello bot");
      expect(messages[0].is_bot_response).toBe(0);
      expect(messages[1].message_content).toBe("Test reply");
      expect(messages[1].is_bot_response).toBe(1);

      expect(generateReply).toHaveBeenCalledWith(
        "Hello bot",
        mockCharacter,
        true,
        expect.any(String),
      );
    });

    it("should include chat history when generating responses", async () => {
      (generateReply as jest.Mock)
        .mockResolvedValueOnce({
          prompt: "Test prompt 1",
          reply: "First reply",
        })
        .mockResolvedValueOnce({
          prompt: "Test prompt 2",
          reply: "Second reply",
        });

      cliProvider.start();
      const onLineCallback = mockOn.mock.calls.find(
        call => call[0] === "line",
      )[1];

      await onLineCallback("Message 1");
      await onLineCallback("Message 2");

      const secondCall = (generateReply as jest.Mock).mock.calls[1];
      expect(secondCall[3]).toContain("First reply");
    });

    it("should maintain session across messages", async () => {
      (generateReply as jest.Mock).mockResolvedValue({
        prompt: "Test prompt",
        reply: "Test reply",
      });

      cliProvider.start();
      const onLineCallback = mockOn.mock.calls.find(
        call => call[0] === "line",
      )[1];

      await onLineCallback("Message 1");
      await onLineCallback("Message 2");

      const messages = db
        .prepare("SELECT * FROM chat_messages")
        .all() as ChatMessage[];
      const uniqueSessions = new Set(messages.map(m => m.session_id));
      expect(uniqueSessions.size).toBe(1);
    });

    it("should save messages in correct order", async () => {
      (generateReply as jest.Mock).mockResolvedValue({
        prompt: "Test prompt",
        reply: "Test reply",
      });

      cliProvider.start();
      const onLineCallback = mockOn.mock.calls.find(
        call => call[0] === "line",
      )[1];

      await onLineCallback("Test message");

      const messages = db
        .prepare("SELECT * FROM chat_messages ORDER BY created_at")
        .all() as ChatMessage[];
      expect(messages[0].is_bot_response).toBe(0);
      expect(messages[1].is_bot_response).toBe(1);
    });

    it("should handle errors during response generation", async () => {
      const error = new Error("Test error");
      (generateReply as jest.Mock).mockRejectedValue(error);

      cliProvider.start();
      const onLineCallback = mockOn.mock.calls.find(
        call => call[0] === "line",
      )[1];

      await onLineCallback("Hello bot");

      // Verify no response was saved
      const messages = db
        .prepare("SELECT * FROM chat_messages WHERE is_bot_response = 1")
        .all() as ChatMessage[];
      expect(messages).toHaveLength(0);
    });

    it("should handle program termination", () => {
      cliProvider.start();
      const onCloseCallback = mockOn.mock.calls.find(
        call => call[0] === "close",
      )[1];

      const mockExit = jest.spyOn(process, "exit").mockImplementation();
      onCloseCallback();
      expect(mockExit).toHaveBeenCalledWith(0);
      mockExit.mockRestore();
    });
  });
});
