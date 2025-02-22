import { FastifyInstance } from "fastify";
import { getCharacters } from "../characters";
import { TelegramProvider } from "../socialmedia/telegram";

// Shared schema for username parameter
const usernameParamSchema = {
  type: "object",
  properties: {
    username: { type: "string" },
  },
};

export async function telegramRoutes(server: FastifyInstance) {
  // Start Telegram bot endpoint
  server.post(
    "/telegram/start/:username",
    {
      schema: {
        description: "Start Telegram bot for an agent",
        tags: ["Telegram"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(x => x.username === username);
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const telegramProvider = TelegramProvider.getInstance(character);

      // Check if bot is already running
      if (telegramProvider.isActive()) {
        return { success: true, message: "Telegram bot is already running" };
      }

      telegramProvider.start();
      return { success: true, message: "Telegram bot started" };
    },
  );

  // Get Telegram status endpoint
  server.get(
    "/telegram/status/:username",
    {
      schema: {
        description: "Get Telegram bot status",
        tags: ["Telegram"],
        params: usernameParamSchema,
        response: {
          200: {
            type: "object",
            properties: {
              username: { type: "string" },
              isActive: { type: "boolean" },
              activeChats: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(x => x.username === username);
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const telegramProvider = await TelegramProvider.getInstance(character);

      return {
        username,
        isActive: telegramProvider.isActive(),
        activeChats: telegramProvider.getActiveChats(),
      };
    },
  );

  // Stop Telegram bot endpoint
  server.post(
    "/telegram/stop/:username",
    {
      schema: {
        description: "Stop Telegram bot for an agent",
        tags: ["Telegram"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(x => x.username === username);
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const telegramProvider = TelegramProvider.getInstance(character);
      await telegramProvider.stop();
      return { success: true, message: "Telegram bot stopped" };
    },
  );
}
