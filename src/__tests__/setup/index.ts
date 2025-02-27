import { config } from "dotenv";
import BetterSqlite3 from "better-sqlite3";
import { initializeSchema } from "../../database/schema";
import * as sqliteVec from "sqlite-vec";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Set test environment
process.env.NODE_ENV = "test";

// Load environment variables
config();

// Create a temporary database file for testing in the OS temp directory
const TEST_DB_PATH = path.join(os.tmpdir(), `test-${Date.now()}.db`);

// Remove any existing test database
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Create a new database connection
const testDb = new BetterSqlite3(TEST_DB_PATH);
sqliteVec.load(testDb);

initializeSchema(testDb);

// Make the test database available globally for tests
(global as any).testDb = testDb;

// Import mocks after database is initialized
import { mocks } from "./mocks";
(global as any).mocks = mocks;

// Clear the test database before each test
beforeEach(() => {
  testDb.prepare("DELETE FROM tweets").run();
  testDb.prepare("DELETE FROM prompts").run();
  // Only try to delete vector_tweets if it exists
  const vectorTableExists = testDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='vector_tweets'",
    )
    .get();
  if (vectorTableExists) {
    testDb.prepare("DELETE FROM vector_tweets").run();
  }
  testDb.prepare("DELETE FROM chat_messages").run();
  jest.clearAllMocks();
});

// Close and cleanup after all tests
afterAll(() => {
  testDb.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});
