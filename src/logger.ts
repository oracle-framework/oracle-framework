import { resolve } from "path";
import pino from "pino";
import fs from "fs";

// Check environment
const isDevelopment = process.env["NODE_ENV"] !== "production";

// Log file path
const logFilePath = resolve("./logs/app.log");

// Ensure logs directory exists in production
if (!isDevelopment) {
  fs.mkdirSync(resolve("./logs"), { recursive: true });
}

// Base config
const baseLogger = pino({
  level: process.env["LOG_LEVEL"] || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Fix: Ensure pretty logging in development
export const logger = isDevelopment
  ? pino({
      level: process.env["LOG_LEVEL"] || "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    })
  : pino(
      baseLogger,
      pino.destination({
        dest: logFilePath,
        mkdir: true,
        sync: false,
      }),
    );
