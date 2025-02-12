import { jest } from "@jest/globals";
import BetterSqlite3 from "better-sqlite3";
import { logger } from "../logger";

const mockDb = {
  pragma: jest.fn(),
};

// Mock better-sqlite3
jest.mock("better-sqlite3", () => {
  return jest.fn(() => mockDb);
});

// Mock logger
jest.mock("../logger", () => ({
  logger: {
    error: jest.fn().mockImplementation((...args) => {}),
  },
}));

// Mock schema initialization
jest.mock("../database/schema", () => ({
  initializeSchema: jest.fn(),
}));

describe("Database Initialization", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("should initialize database successfully", async () => {
    const { db } = require("../database/db");
    expect(db).toBeDefined();
    expect(db.pragma).toHaveBeenCalledWith("journal_mode = WAL");
  });

  it("should handle pragma error", async () => {
    const mockError = new Error("Pragma error");
    const mockLogger = { error: jest.fn() };
    jest.doMock("../logger", () => ({ logger: mockLogger }));

    mockDb.pragma.mockImplementationOnce(() => {
      throw mockError;
    });

    try {
      require("../database/db");
    } catch (error) {
      // Error is expected
    }

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error initializing database:",
      mockError,
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error stack:",
      mockError.stack,
    );
  });
});
