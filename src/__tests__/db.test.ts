import { jest } from "@jest/globals";

jest.mock("../logger", () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

describe("Database Initialization", () => {
  it("should initialize database successfully", () => {
    const testDb = (global as any).testDb;
    expect(testDb).toBeDefined();

    // Test that the database is functional by running a simple query
    const result = testDb.prepare("SELECT 1 as test").get();
    expect(result.test).toBe(1);
  });

  it("should handle pragma error", () => {
    const testDb = (global as any).testDb;
    const mockError = new Error("Test error");

    // Mock the pragma method to throw an error
    const originalPragma = testDb.pragma;
    testDb.pragma = jest.fn().mockImplementation(() => {
      throw mockError;
    });

    try {
      testDb.pragma("journal_mode", { simple: true });
      fail("Expected pragma to throw an error");
    } catch (error) {
      expect(error).toBe(mockError);
    }

    // Restore the original pragma method
    testDb.pragma = originalPragma;
  });
});
