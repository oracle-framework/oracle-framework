# oracle framework

Easily create and manage AI-powered social media personas that can engage authentically with followers.

## Overview

Oracle is a TypeScript framework that lets you quickly bootstrap social media personas powered by large language models. Each persona has its own personality, posting style, and interaction patterns.

## Quick Start

1. Clone and install dependencies:

```bash
git clone git@github.com:teeasma/oracle-framework.git
cd oracle-framework
npm install
# or with yarn
yarn install
```

2. Set up environment:

```bash
cp .env.example .env
```

3. Configure your `.env` file with:

- LLM provider credentials (OpenRouter recommended)
- Twitter account credentials
- Telegram bot token (optional)

4. Create your agent:

- Copy and modify `src/characters/carolaine.json` with your agent's personality

5. Run:

```bash
# Generate Twitter authentication
npm run dev -- generateCookies <username>
# or with yarn
yarn dev generateCookies <username>

# Start the agent's actions on Twitter
npm run dev -- autoResponder <username>     # Reply to timeline
npm run dev -- topicPoster <username>       # Post new topics
npm run dev -- replyToMentions <username>   # Handle mentions

# Start the agent's actions on Telegram
npm run dev -- listenToTelegram <username>

# Start the agent's actions on Discord
npm run dev -- listenToDiscord <username>
```

## Development

```bash
# Build the project
npm run build
# or
yarn build

# Run in development mode
npm run dev
# or
yarn dev

# Format code
npm run format
# or
yarn format
```

## Features

- **AI-Powered Interactions**: Uses LLMs to generate human-like responses and posts
- **Personality System**: Define your agent's character, tone, and behavior
- **Multi-Modal**: Can generate and handle text, images, and voice content
- **Platform Support**: Supports Twitter, Telegram, Discord and more integrations coming soon
- **Engagement Tools**: Auto-posting, replies, mention handling

## Configuration

### Environment Variables

Required variables in `.env`:

```bash
# LLM Provider configuration
LLM_PROVIDER_URL=
LLM_PROVIDER_API_KEY=

# Agent configuration
AGENT_TWITTER_PASSWORD=
AGENT_TWITTER_EMAIL=
AGENT_TELEGRAM_API_KEY=
AGENT_DISCORD_API_KEY=
AGENT_MS2_API_KEY=
AGENT_OPENAI_API_KEY=
```

### Character Configuration

The character is defined in a JSON file at `src/characters/character.json`. This file contains the AI agent's personality, behavior patterns, and platform-specific settings.

The character file has the following structure:

```json
{
  "username": "your_agent_username",
  "agentName": "Display Name",
  "bio": [
    "Multiple bio options",
    "Each one capturing a different aspect of the character"
  ],
  "lore": [
    "Background stories and history",
    "Events that shaped the character",
    "Memorable moments and achievements"
  ],
  "postDirections": [
    "Guidelines for posting style",
    "Tone and voice instructions",
    "Behavioral patterns to follow"
  ],
  "topics": [
    "Main subjects the agent discusses",
    "Areas of expertise",
    "Recurring themes"
  ],
  "adjectives": [
    "personality traits",
    "character descriptors",
    "mood indicators"
  ],
  "postingBehavior": {
    "replyInterval": 2700000,
    "topicInterval": 10800000,
    "removePeriods": true,
    "telegramRules": [
      "Custom response rules for Telegram",
      "Format: if message contains X reply with Y"
    ],
    "telegramModel": "meta-llama/llama-3.3-70b-instruct",
    "generateImagePrompt": true,
    "imagePromptChance": 0.33,
    "stickerChance": 0.2
  },
  "imageGenerationBehavior": {
    "provider": "ms2",
    "imageGenerationPromptModel": "meta-llama/llama-3.3-70b-instruct"
  },
  "audioGenerationBehavior": {
    "provider": "openai",
    "openai": {
      "model": "tts-1",
      "voice": "nova",
      "speed": 1.0
    }
  },
  "telegramBotUsername": "YOUR_BOT_USERNAME",
  "discordBotUsername": "YOUR_BOT_USERNAME",
  "model": "anthropic/claude-3.5-sonnet",
  "fallbackModel": "meta-llama/llama-3.3-70b-instruct",
  "temperature": 0.75
}
```

#### Key Configuration Fields:

- **username**: The agent's username (used for Twitter and internal identification)
- **agentName**: Display name shown on social platforms
- **bio**: Array of possible bio texts that define the character
- **lore**: Background stories that shape the character's history and personality
- **postDirections**: Specific guidelines for how the agent should post and interact
- **topics**: Subjects the agent is knowledgeable about and discusses
- **adjectives**: Character traits that define the personality
- **postingBehavior**: Technical settings for posting frequency and style
  - `replyInterval`: Time between replies in milliseconds
  - `topicInterval`: Time between topic posts in milliseconds
  - `telegramRules`: Custom response patterns for Telegram
  - `generateImagePrompt`: Whether to generate image prompts
  - `imagePromptChance`: Probability of generating an image
- **imageGenerationBehavior**: Settings for image generation capabilities
- **audioGenerationBehavior**: Settings for voice/audio generation
- **model**: Primary LLM to use for generation
- **fallbackModel**: Backup model if primary is unavailable
- **temperature**: "Creativity" level (0.0-1.0, higher = more creative)

## Commands

### Twitter

- `generateCookies`: Create Twitter authentication cookies
- `autoResponder`: Start the timeline response system
- `topicPoster`: Begin posting original content
- `replyToMentions`: Handle mentions and replies

### Telegram

- `listenToTelegram`: Start the Telegram bot

Important:

- Telegram requires a bot token, which you can get from [@BotFather](https://t.me/botfather) in Telegram.

### Discord

- `listenToDiscord`: Start the Discord bot

Important:

- Discord requires an API key, which you can get from [the Discord Developer Portal](https://discord.com/developers/applications)

## LLM Providers

- **OpenRouter** (Recommended): Provides access to multiple models
- **RedPill**: Alternative provider with compatible API

## Best Practices

1. Test your agent's personality thoroughly before deployment
2. Monitor early interactions to ensure appropriate responses
3. Adjust posting frequencies based on engagement
4. Regularly update the agent's knowledge and interests

## Development Status

Current TODO:

- [ ] Improve reply quality on Twitter
- [ ] Add scraping of targeted content
- [ ] Develop reply prioritization system

## Support

For issues and feature requests, please use the GitHub issue tracker.
