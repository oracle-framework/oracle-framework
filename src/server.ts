import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { logger } from "./logger";

export async function buildServer(): Promise<FastifyInstance> {
  try {
    logger.info("Creating Fastify instance...");
    const server = fastify({
      logger: {
        level: "info",
        transport: {
          target: "pino-pretty",
        },
      },
    });

    // Register plugins
    logger.info("Registering CORS plugin...");
    await server.register(cors, {
      origin: true, // You might want to restrict this in production
    });

    // Register Swagger
    logger.info("Registering Swagger plugin...");
    await server.register(swagger, {
      swagger: {
        info: {
          title: "Oracle Framework API",
          description: "API documentation for the Oracle Framework",
          version: "1.0.0",
        },
        host: "localhost:3000",
        schemes: ["http"],
        consumes: ["application/json"],
        produces: ["application/json"],
      },
    });

    logger.info("Registering Swagger UI plugin...");
    await server.register(swaggerUi, {
      routePrefix: "/documentation",
    });

    // Health check route
    logger.info("Setting up health check route...");
    server.get(
      "/health",
      {
        schema: {
          description: "Health check endpoint",
          tags: ["System"],
          response: {
            200: {
              type: "object",
              properties: {
                status: { type: "string" },
                timestamp: { type: "string" },
              },
            },
          },
        },
      },
      async () => {
        return {
          status: "ok",
          timestamp: new Date().toISOString(),
        };
      },
    );

    logger.info("Server built successfully");
    return server;
  } catch (error) {
    logger.error("Error building server:", error);
    if (error instanceof Error) {
      logger.error("Error details:", error.message);
      logger.error("Stack trace:", error.stack);
    }
    throw error;
  }
}

export async function startServer(
  server: FastifyInstance,
  port: number = 3000,
) {
  try {
    logger.info(`Starting server on port ${port}...`);
    await server.listen({ port, host: "0.0.0.0" });
    logger.info(`Server is running on port ${port}`);
  } catch (err) {
    logger.error("Error starting server:", err);
    if (err instanceof Error) {
      logger.error("Error details:", err.message);
      logger.error("Stack trace:", err.stack);
    }
    throw err;
  }
}
