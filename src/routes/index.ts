import { FastifyInstance } from "fastify";
import { twitterRoutes } from "./twitter";
import { discordRoutes } from "./discord";
import { telegramRoutes } from "./telegram";
import { getCharacters } from "../characters";

export async function setupRoutes(server: FastifyInstance) {
  // Characters endpoint
  server.get(
    "/characters",
    {
      schema: {
        description: "Get list of available characters",
        tags: ["Characters"],
        response: {
          200: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
    },
    async () => {
      return getCharacters().map(c => c.username);
    },
  );

  // Register all route groups
  await server.register(twitterRoutes, { prefix: "" });
  await server.register(discordRoutes, { prefix: "" });
  await server.register(telegramRoutes, { prefix: "" });
}
