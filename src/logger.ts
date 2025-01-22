import { resolve } from "path";
import pino from "pino";
import rotate from "pino-roll";

const isDevelopment = process.env["NODE_ENV"] !== "production";

// Base logger configuration
const baseConfig = {
  level: process.env["LOG_LEVEL"] || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
  },
};

// Development configuration with pretty printing
const developmentConfig = {
  ...baseConfig,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss Z",
      ignore: "pid,hostname",
    },
  },
};

// Production configuration with file output
const productionConfig = {
  ...baseConfig,
  transport: {
    target: "pino/file",
    options: { destination: resolve("./logs/app.log") },
  },
};

// Create logger with appropriate config
export const logger = pino(
  isDevelopment ? developmentConfig : productionConfig,
);

// Only set up rotation in production
if (!isDevelopment) {
  rotate(resolve("./logs/app.log"), {
    size: "10m",
    interval: "1d",
    compress: true,
    maxFiles: 5,
    mkdir: true,
    dateFormat: "YYYY-MM-DD",
    nameFormat: "app.log.%DATE%",
  });
}

// Add convenience methods for common logging patterns
export const logError = (error: Error, context: Record<string, any> = {}) => {
  logger.error(
    {
      err: error,
      ...context,
      stack: error.stack,
    },
    error.message,
  );
};

export const logRequest = (method: string, url: string, duration: number) => {
  logger.info(
    {
      type: "request",
      method,
      url,
      duration_ms: duration,
    },
    `${method} ${url}`,
  );
};

export const logInfo = (message: string, context: Record<string, any> = {}) => {
  logger.info(context, message);
};

export const logDebug = (
  message: string,
  context: Record<string, any> = {},
) => {
  logger.debug(context, message);
};
