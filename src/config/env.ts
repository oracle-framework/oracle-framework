import dotenv from "dotenv";
import { logger } from "../logger";
import * as path from "path";

// Initialize environment variables
logger.info("Loading environment variables...");
logger.info(`Current working directory: ${process.cwd()}`);
logger.info(`Looking for .env file at: ${path.join(process.cwd(), ".env")}`);

const result = dotenv.config();
if (result.error) {
  logger.error("Error loading .env file:", result.error);
  process.exit(1);
}

// Validate required environment variables
const requiredEnvVars = ["LLM_PROVIDER_URL", "LLM_PROVIDER_API_KEY"];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
  process.exit(1);
}

logger.info("Environment variables loaded successfully");
logger.info(
  `LLM_PROVIDER_API_KEY: ${process.env.LLM_PROVIDER_API_KEY ? "present" : "missing"}`,
);
logger.info(
  `LLM_PROVIDER_URL: ${process.env.LLM_PROVIDER_URL ? "present" : "missing"}`,
);

export const config = {
  llmProvider: {
    url: process.env.LLM_PROVIDER_URL!,
    apiKey: process.env.LLM_PROVIDER_API_KEY!,
  },
  telegram: {
    apiKey: process.env.AGENT_TELEGRAM_API_KEY,
  },
  discord: {
    apiKey: process.env.AGENT_DISCORD_API_KEY,
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
};
