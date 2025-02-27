import { FastifyInstance } from "fastify";
import { getCharacters, Character } from "../characters";
import { DiscordProvider } from "../socialmedia/discord";
import { logger } from "../logger";

// Shared schema for username parameter
const usernameParamSchema = {
  type: "object",
  properties: {
    username: { type: "string" },
  },
};

export async function discordRoutes(server: FastifyInstance) {
  // Start Discord bot endpoint
  server.post(
    "/discord/start/:username",
    {
      schema: {
        description: "Start Discord bot for an agent",
        tags: ["Discord"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      logger.info(`API request: Start Discord bot for ${username}`);

      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        logger.error(`API error: Character not found: ${username}`);
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }

      try {
        // Use getInstance instead of creating a new instance
        const discordProvider = DiscordProvider.getInstance(character);
        await discordProvider.start();
        logger.info(`API success: Discord bot started for ${username}`);
        return {
          success: true,
          message: `Discord bot started for ${username}`,
        };
      } catch (error) {
        logger.error(
          `API error: Failed to start Discord bot for ${username}:`,
          error,
        );
        return reply.status(500).send({
          error: `Failed to start Discord bot: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  );

  // Get Discord status endpoint
  server.get(
    "/discord/status/:username",
    {
      schema: {
        description: "Get Discord bot status",
        tags: ["Discord"],
        params: usernameParamSchema,
        response: {
          200: {
            type: "object",
            properties: {
              username: { type: "string" },
              isActive: { type: "boolean" },
              connectedServers: {
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
      logger.info(`API request: Get status for Discord bot ${username}`);

      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        logger.error(`API error: Character not found: ${username}`);
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }

      try {
        // Use getInstance instead of creating a new instance
        const discordProvider = DiscordProvider.getInstance(character);
        const isActive = discordProvider.isActive();
        const connectedServers = discordProvider.getConnectedServers();

        logger.info(
          `API success: Discord bot ${username} status - active: ${isActive}, servers: ${connectedServers.length}`,
        );

        return {
          username,
          isActive,
          connectedServers,
        };
      } catch (error) {
        logger.error(
          `API error: Failed to get Discord bot status for ${username}:`,
          error,
        );
        return reply.status(500).send({
          error: `Failed to get Discord bot status: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  );

  // Stop Discord bot endpoint
  server.post(
    "/discord/stop/:username",
    {
      schema: {
        description: "Stop Discord bot for an agent",
        tags: ["Discord"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      logger.info(`API request: Stop Discord bot for ${username}`);

      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        logger.error(`API error: Character not found: ${username}`);
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }

      try {
        // Use getInstance instead of creating a new instance
        const discordProvider = DiscordProvider.getInstance(character);

        // Log active status before stopping
        const wasActive = discordProvider.isActive();
        logger.info(
          `Discord bot for ${username} active status before stopping: ${wasActive}`,
        );

        // Force stop even if isActive() returns false
        logger.info(`Forcing Discord bot to stop for ${username}`);
        await discordProvider.stop();

        const nowActive = DiscordProvider.getActiveBots().includes(username);
        logger.info(
          `Discord bot ${username} is now in active list: ${nowActive}`,
        );

        // Let the user know what happened based on the previous state
        if (wasActive) {
          logger.info(
            `API success: Active Discord bot stopped for ${username}`,
          );
          return {
            success: true,
            message: `Discord bot stopped for ${username}`,
          };
        } else {
          logger.info(
            `API partial success: Discord bot was not active, but resources cleaned up for ${username}`,
          );
          return {
            success: true,
            message: `Discord bot was not active, but resources were cleaned up for ${username}`,
          };
        }
      } catch (error) {
        logger.error(
          `API error: Failed to stop Discord bot for ${username}:`,
          error,
        );
        return reply.status(500).send({
          error: `Failed to stop Discord bot: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  );

  // Get all active Discord bots endpoint
  server.get(
    "/discord/active",
    {
      schema: {
        description: "Get all active Discord bots",
        tags: ["Discord"],
        response: {
          200: {
            type: "object",
            properties: {
              activeBots: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      logger.info("API request: Get all active Discord bots");
      const activeBots = DiscordProvider.getActiveBots();
      logger.info(
        `API success: Found ${activeBots.length} active Discord bots`,
      );
      return { activeBots };
    },
  );

  // Force destroy all Discord bots
  server.post(
    "/discord/stopAll",
    {
      schema: {
        description: "Stop all active Discord bots",
        tags: ["Discord"],
      },
    },
    async (request, reply) => {
      logger.info("API request: Stop all Discord bots");

      try {
        const activeBots = DiscordProvider.getActiveBots();
        logger.info(`Stopping ${activeBots.length} active Discord bots`);

        const results = [];

        for (const botName of activeBots) {
          try {
            const character = getCharacters().find(x => x.username === botName);
            if (character) {
              const provider = DiscordProvider.getInstance(character);
              await provider.stop();
              results.push({ username: botName, success: true });
              logger.info(`Successfully stopped Discord bot for ${botName}`);
            } else {
              results.push({
                username: botName,
                success: false,
                error: "Character not found",
              });
              logger.error(
                `Failed to stop Discord bot for ${botName}: Character not found`,
              );
            }
          } catch (error) {
            results.push({
              username: botName,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
            logger.error(`Failed to stop Discord bot for ${botName}:`, error);
          }
        }

        logger.info(
          `API success: Processed stop requests for ${results.length} Discord bots`,
        );
        return {
          success: true,
          message: `Processed stop requests for ${results.length} Discord bots`,
          results,
        };
      } catch (error) {
        logger.error("API error: Failed to stop all Discord bots:", error);
        return reply.status(500).send({
          error: `Failed to stop all Discord bots: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  );
}
