import { config } from "dotenv";
import BetterSqlite3 from "better-sqlite3";
import { initializeSchema } from "../../database/schema";

// Load environment variables
config();

// Create an in-memory database for testing
const testDb = new BetterSqlite3(":memory:");
initializeSchema(testDb);

// Make the test database available globally for tests
(global as any).testDb = testDb;

// Import mocks after database is initialized
import { mocks } from "./mocks";
(global as any).mocks = mocks;

// Clear the test database before each test
beforeEach(() => {
  testDb.prepare("DELETE FROM twitter_history").run();
  jest.clearAllMocks();
});

// Close the database connection after all tests
afterAll(() => {
  testDb.close();
});
