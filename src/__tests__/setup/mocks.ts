// Mock the completions module
jest.mock("../../completions", () => ({
  generateTopicPost: jest.fn().mockResolvedValue({
    prompt: "Test prompt",
    reply: "Test tweet content",
  }),
  generateReply: jest.fn(),
  handleBannedAndLengthRetries: jest
    .fn()
    .mockResolvedValue("Test image prompt"),
  generateImagePromptForCharacter: jest
    .fn()
    .mockResolvedValue("Test image prompt"),
}));

// Mock the images module
jest.mock("../../images", () => ({
  generateImageForTweet: jest
    .fn()
    .mockResolvedValue(Buffer.from("test image data")),
}));

// Mock the Scraper class
const mockSendTweet = jest
  .fn()
  .mockImplementation((_text: string, _replyTo?: string, media?: any[]) => {
    // Return different responses based on whether media is present
    const tweetId = media
      ? "mock-tweet-id-with-image-123"
      : "mock-tweet-id-123";
    return {
      json: () =>
        Promise.resolve({
          data: {
            create_tweet: {
              tweet_results: {
                result: {
                  rest_id: tweetId,
                },
              },
            },
          },
        }),
    };
  });

const mockScraper = {
  login: jest.fn(),
  getCookies: jest.fn().mockResolvedValue([]),
  setCookies: jest.fn(),
  sendTweet: mockSendTweet,
  sendTweetWithMedia: mockSendTweet,
};

jest.mock("goat-x", () => ({
  Scraper: jest.fn().mockImplementation(() => mockScraper),
  SearchMode: {
    Latest: "Latest",
  },
}));

// Export mocks for tests to use
export const mocks = {
  mockScraper,
  mockSendTweet,
};
