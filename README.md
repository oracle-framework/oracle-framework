# oracle framework

The easiest way to create and manage AI-powered social media personas that can authentically engage with followers.

[![Discord](https://img.shields.io/discord/1332521682224680984?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/FsTXmwaG3g)

[![Twitter](https://img.shields.io/twitter/follow/oracleframework?style=flat)](https://twitter.com/oracleframework)

## Overview

Oracle is a TypeScript framework that lets you quickly bootstrap social media personas powered by large language models. Each persona has its own personality, posting style, and interaction patterns.

## Quick Start

1. Clone and install dependencies:

```bash
git clone https://github.com/teeasma/oracle-framework
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

- LLM provider credentials (we recommend OpenRouter), ie

```
LLM_PROVIDER_URL=https://openrouter.ai/api/v1
LLM_PROVIDER_API_KEY=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
```

- Twitter account credentials (optional)
- Telegram bot token (optional)
- Discord bot token (optional)

4. Create your agent:

- Modify `src/characters/characters.json` with your agent's personality.

Advanced usage: you can have more than one agent in the file and run more than one agent at a time but you will need to change the environment variables accordingly.

5. Run:

```bash
# Talk to your agent on the command line, default username is "carolainetrades"
npm run dev -- cli <username>
# or with yarn
yarn dev cli <username>

# Run on Twitter

# Generate Twitter authentication
npm run dev -- generateCookies <username>
# or with yarn
yarn dev generateCookies <username>

# Start the agent's actions on Twitter
npm run dev -- autoResponder <username>     # Reply to timeline
npm run dev -- topicPost <username>         # Post new topics
npm run dev -- replyToMentions <username>   # Handle mentions

# Start the agent on Telegram
npm run dev telegram <username>

# Start the agent on Discord
npm run dev discord <username>
```

## Development

```bash
# Build the project
npm run build
# or
yarn build

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

### Character Setup

Characters are defined in a single JSON file under `src/characters/characters.json`. Each character file contains the AI agent's personality, behavior patterns, and platform-specific settings.

```json
[
  {
    "username": "your agent's username -- this is the same as the Twitter username",
    "agentName": "your agent's name",
    "bio": [
      "your agent's bio",
      "this is an array of strings",
      "containing your agent's description"
    ],
    "lore": [
      "your agent's lore",
      "this is an array of strings",
      "containing your agent's backstory"
    ],
    "postDirections": [
      "your agent's post directions",
      "this is an array of strings",
      "containing your agent's posting style"
    ],
    "topics": [
      "your agent's topics",
      "this is an array of strings",
      "containing your agent's favorite topics"
    ],
    "adjectives": ["adjectives used to create posts"],
    "telegramBotUsername": "your agent's name on Telegram",
    "discordBotUsername": "your agent's name on Discord",
    "postingBehavior": {
      // how long to wait before replying (ms)
      "replyInterval": 2700000,
      // how long to wait before posting a new topic (ms)
      "topicInterval": 10800000,
      // whether to remove periods from the message
      "removePeriods": true,
      // list of rules for chat mode
      "chatModeRules": [
        "if the message says: a you say b",
        "if the message says: good night you reply gn"
      ],
      // model to use for chat mode
      "chatModeModel": "meta-llama/llama-3.3-70b-instruct",
      // whether to generate an image prompt
      "generateImagePrompt": true,
      // chance to post an image when generating a new post on Twitter
      "imagePromptChance": 0.33,
      // chance to post a sticker on Telegram
      "stickerChance": 0.2,
      // list of stickers to use on Telegram
      "stickerFiles": [
        "CAACAgEAAyEFAASMuWLFAAIDkWeDQ_kOhEWzEl0oTiAOokps_P24AAKzBAAC6XRQRu807DcersvfNgQ",
        "CAACAgIAAyEFAASMuWLFAAIDlWeDRJqI8gtcgFW0yBVlSMCfA6KsAAKHMwACYPoYSCgCth58j8ruNgQ"
      ]
    },
    // currently only used on Twitter
    // the provider to use for image generation and the model to use for the prompt
    // ms2 is the only one that has a milady and cheesworld chance
    "imageGenerationBehavior": {
      "provider": "ms2",
      "imageGenerationPromptModel": "meta-llama/llama-3.3-70b-instruct",
      "ms2": {
        "miladyChance": 0.2,
        "cheesworldChance": 0.2
      }
    },
    // the provider to use for audio generation
    "audioGenerationBehavior": {
      "provider": "kokoro",
      "kokoro": {
        "voice": "af",
        "speed": 1.0
      }
    },
    // the main LLM to use for content generation
    "model": "anthropic/claude-3.5-sonnet",
    // the fallback LLM to use if the prompt is banned
    "fallbackModel": "meta-llama/llama-3.3-70b-instruct",
    // the temperature to use
    "temperature": 0.75
  }
]
```

#### Key Configuration Fields:

- **agentName**: Display name shown on social platforms
- **username**: Twitter handle without '@'
- **bio**: The agent's bio
- **lore**: Background stories that shape the character's history
- **postDirections**: Guidelines for how the agent should post
- **topics**: Subjects the agent is knowledgeable about
- **adjectives**: Character traits that define the personality
- **postingBehavior**: Technical settings for posting frequency and style
- **model**: Primary LLM to use for generation
- **temperature**: "Creativity" level - 0.0-1.0, higher = more creative. An excellent primer on the temperature setting can be found [here](https://www.vellum.ai/llm-parameters/temperature).

For a complete example, check out `src/characters/characters.json`. We have a sample character called Carolaine. You can see her in action at [@carolainetrades](https://twitter.com/carolainetrades).

### Environment Variables

Required variables in `.env`:

```
LLM_PROVIDER_URL=
LLM_API_KEY=

# Twitter configuration (if using Twitter)
AGENT_TWITTER_PASSWORD=

# Telegram configuration (if using Telegram)
AGENT_TELEGRAM_API_KEY=

# Discord configuration (if using Discord)
AGENT_DISCORD_API_KEY=

# MS2 configuration (if using MS2 for image generation)
AGENT_MS2_API_KEY=
```

### LLM Providers

We highly recommend using OpenRouter as your LLM provider. It offers a wide range of models and it is OpenAI compatible.

- **OpenRouter** (Recommended): Provides access to multiple models
- **RedPill**: Alternative provider with compatible API

**Important note for OpenAI:**

If you are using OpenAI as your LLM provider you will not be able to use Claude 3.5 Sonnet as your primary model or Llama as a fallback or on the chat mode, so please configure your character file accordingly.

Set `LLM_PROVIDER_URL=https://api.openai.com/v1` and all the models used in the character file will have to be OpenAI models, you can find the list of models [here](https://platform.openai.com/docs/models).

### Model Selection

Generally speaking we have found that the best all purpose model for creative writing is `anthropic/claude-3.5-sonnet`. The reason why we fallback to `meta-llama/llama-3.3-70b-instruct` is that Claude is heavily moderated and some use cases (like Carolaine) require the agent to speak about topics that the LLM's moderators will not allow. `meta-llama/llama-3.3-70b-instruct` is the main model we recommend for chat mode as we don't currently test for banned prompts in chat mode to make the experience snappier and feel like you are talking to a real person.

## Commands

### Twitter

- `generateCookies`: Create Twitter authentication cookies
- `autoResponder`: Start the timeline response system
- `topicPost`: Begin posting original content
- `replyToMentions`: Handle mentions and replies

### Telegram

- `telegram`: Start the Telegram bot

Important:

- Telegram requires a bot token, which you can get from [@BotFather](https://t.me/botfather) in Telegram.

### Discord

- `discord`: Start the Discord bot

Important:

- Discord requires an API key, which you can get from [the Discord Developer Portal](https://discord.com/developers/applications) -- You will also need to enable several permissions and use the Application ID as the agent's name in the config file (`src/characters/characters.json`).

## Best Practices

1. Test your agent's personality thoroughly before deployment. The best way to do this is to use CLI mode as you don't need to deploy anything or connect to any external services.
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
