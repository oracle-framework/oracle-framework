module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  moduleFileExtensions: ["ts", "js", "json", "node"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup/index.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/__tests__/helpers/",
    "/__tests__/mocks/",
    "/__tests__/setup/",
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/__tests__/helpers/",
    "/__tests__/mocks/",
    "/__tests__/setup/",
  ],
};
