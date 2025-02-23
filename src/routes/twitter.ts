import { FastifyInstance } from "fastify";
import { getCharacters } from "../characters";
import { TwitterProvider } from "../socialmedia/twitter";
import { Character } from "../characters";

// Shared schema for username parameter
const usernameParamSchema = {
  type: "object",
  properties: {
    username: { type: "string" },
  },
};

export async function twitterRoutes(server: FastifyInstance) {
  // Auto-responder endpoints
  server.post(
    "/twitter/auto-responder/:username/start",
    {
      schema: {
        description: "Start auto-responder for Twitter",
        tags: ["Twitter"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const twitterProvider = await TwitterProvider.getInstance(character);
      await twitterProvider.startAutoResponder();
      return { success: true, message: "Auto-responder started" };
    },
  );

  server.post(
    "/twitter/auto-responder/:username/stop",
    {
      schema: {
        description: "Stop auto-responder for Twitter",
        tags: ["Twitter"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const twitterProvider = await TwitterProvider.getInstance(character);
      await twitterProvider.stopAutoResponder();
      return { success: true, message: "Auto-responder stopped" };
    },
  );

  // Topic posting endpoints
  server.post(
    "/twitter/topic-post/:username/start",
    {
      schema: {
        description: "Start topic posting for Twitter",
        tags: ["Twitter"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const twitterProvider = await TwitterProvider.getInstance(character);
      await twitterProvider.startTopicPosts();
      return { success: true, message: "Topic posting started" };
    },
  );

  server.post(
    "/twitter/topic-post/:username/stop",
    {
      schema: {
        description: "Stop topic posting for Twitter",
        tags: ["Twitter"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const twitterProvider = await TwitterProvider.getInstance(character);
      await twitterProvider.stopTopicPosts();
      return { success: true, message: "Topic posting stopped" };
    },
  );

  // Reply to mentions endpoints
  server.post(
    "/twitter/reply-mentions/:username/start",
    {
      schema: {
        description: "Start replying to Twitter mentions",
        tags: ["Twitter"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const twitterProvider = await TwitterProvider.getInstance(character);
      await twitterProvider.startReplyingToMentions();
      return { success: true, message: "Mention replying started" };
    },
  );

  server.post(
    "/twitter/reply-mentions/:username/stop",
    {
      schema: {
        description: "Stop replying to Twitter mentions",
        tags: ["Twitter"],
        params: usernameParamSchema,
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const twitterProvider = await TwitterProvider.getInstance(character);
      await twitterProvider.stopReplyingToMentions();
      return { success: true, message: "Mention replying stopped" };
    },
  );

  // Get Twitter status endpoint
  server.get(
    "/twitter/status/:username",
    {
      schema: {
        description: "Get Twitter agent status",
        tags: ["Twitter"],
        params: usernameParamSchema,
        response: {
          200: {
            type: "object",
            properties: {
              username: { type: "string" },
              isAutoResponderActive: { type: "boolean" },
              isTopicPostingActive: { type: "boolean" },
              isReplyingToMentions: { type: "boolean" },
              hasCookies: { type: "boolean" },
              nextRunTimes: {
                type: "object",
                properties: {
                  autoResponder: { type: ["string", "null"] },
                  topicPosting: { type: ["string", "null"] },
                  replyToMentions: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { username } = request.params as { username: string };
      const character = getCharacters().find(
        (x: Character) => x.username === username,
      );
      if (!character) {
        return reply
          .status(404)
          .send({ error: `Character not found: ${username}` });
      }
      const twitterProvider = await TwitterProvider.getInstance(character);
      const nextRunTimes = twitterProvider.getNextRunTimes();

      return {
        username,
        isAutoResponderActive: twitterProvider.isAutoResponderActive(),
        isTopicPostingActive: twitterProvider.isTopicPostingActive(),
        isReplyingToMentions: twitterProvider.isReplyingToMentions(),
        hasCookies: await twitterProvider.hasCookies(),
        nextRunTimes,
      };
    },
  );
}
