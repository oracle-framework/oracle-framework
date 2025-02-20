import { FastifyInstance } from 'fastify';
import { getCharacters, Character } from '../characters';
import { DiscordProvider } from '../socialmedia/discord';

// Shared schema for username parameter
const usernameParamSchema = {
  type: 'object',
  properties: {
    username: { type: 'string' }
  }
};

export async function discordRoutes(server: FastifyInstance) {
  // Start Discord bot endpoint
  server.post('/discord/start/:username', {
    schema: {
      description: 'Start Discord bot for an agent',
      tags: ['Discord'],
      params: usernameParamSchema
    }
  }, async (request, reply) => {
    const { username } = request.params as { username: string };
    const character = getCharacters().find((x: Character) => x.username === username);
    if (!character) {
      return reply.status(404).send({ error: `Character not found: ${username}` });
    }
    const discordProvider = new DiscordProvider(character);
    await discordProvider.start();
    return { success: true, message: 'Discord bot started' };
  });

  // Get Discord status endpoint
  server.get('/discord/status/:username', {
    schema: {
      description: 'Get Discord bot status',
      tags: ['Discord'],
      params: usernameParamSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            isActive: { type: 'boolean' },
            connectedServers: { 
              type: 'array',
              items: {
                type: 'string'
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { username } = request.params as { username: string };
    const character = getCharacters().find((x: Character) => x.username === username);
    if (!character) {
      return reply.status(404).send({ error: `Character not found: ${username}` });
    }
    const discordProvider = new DiscordProvider(character);
    
    return {
      username,
      isActive: discordProvider.isActive(),
      connectedServers: discordProvider.getConnectedServers()
    };
  });

  // Stop Discord bot endpoint
  server.post('/discord/stop/:username', {
    schema: {
      description: 'Stop Discord bot for an agent',
      tags: ['Discord'],
      params: usernameParamSchema
    }
  }, async (request, reply) => {
    const { username } = request.params as { username: string };
    const character = getCharacters().find((x: Character) => x.username === username);
    if (!character) {
      return reply.status(404).send({ error: `Character not found: ${username}` });
    }
    const discordProvider = new DiscordProvider(character);
    await discordProvider.stop();
    return { success: true, message: 'Discord bot stopped' };
  });
} 