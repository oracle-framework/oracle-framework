import { Scraper, SearchMode, Profile } from "agent-twitter-client";

// Mock the completions module
jest.mock("../../completions", () => ({
  generateTopicPost: jest.fn().mockResolvedValue({
    prompt: "Test prompt",
    reply: "Test tweet content",
  }) as jest.Mock<Promise<{ prompt: string; reply: string }>>,
  generateReply: jest.fn().mockResolvedValue({
    prompt: "Test prompt",
    reply: "Test reply",
  }) as jest.Mock<Promise<{ prompt: string; reply: string }>>,
  handleBannedAndLengthRetries: jest
    .fn()
    .mockResolvedValue("Test image prompt") as jest.Mock<Promise<string>>,
  generateImagePromptForCharacter: jest
    .fn()
    .mockResolvedValue("Test image prompt") as jest.Mock<Promise<string>>,
  checkIfPromptWasBanned: jest.fn().mockResolvedValue(false) as jest.Mock<
    Promise<boolean>
  >,
  generateCompletionForCharacter: jest
    .fn()
    .mockResolvedValue("safe content") as jest.Mock<Promise<string>>,
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
    const tweetId = media
      ? "mock-tweet-id-with-image-123"
      : "mock-tweet-id-123";
    return Promise.resolve({
      json: () =>
        Promise.resolve({
          data: {
            create_tweet: {
              tweet_results: {
                result: {
                  rest_id: tweetId,
                  core: {
                    user_results: {
                      result: {
                        legacy: {
                          screen_name: "test_user",
                        },
                      },
                    },
                  },
                  legacy: {
                    user_id_str: "09876543219",
                    created_at: "2024-01-01T00:00:00Z",
                    full_text: _text,
                    conversation_id_str: "5647382910",
                    in_reply_to_status_id_str: _replyTo || undefined,
                    in_reply_to_user_id_str: _replyTo
                      ? "1502693748"
                      : undefined,
                    in_reply_to_screen_name: _replyTo
                      ? "test_user_two"
                      : undefined,
                  },
                },
              },
            },
          },
        }),
      headers: {},
      ok: true,
      redirected: false,
      status: 200,
      statusText: "OK",
      type: "default" as const,
      url: "https://api.twitter.com/2/tweets",
      clone: function () {
        return { ...this };
      },
    } as Response);
  });

jest.mock("agent-twitter-client", () => ({
  Scraper: jest.fn(() => ({
    login: jest.fn(),
    getCookies: jest.fn().mockResolvedValue([]),
    setCookies: jest.fn(),
    sendTweet: mockSendTweet,
    sendTweetWithMedia: mockSendTweet,
    getProfile: jest.fn().mockResolvedValue({
      followersCount: 100,
      location: "Test Location",
      description: "Test Bio",
      name: "Test Name",
      username: "test_user",
      profileImageUrl: "https://example.com/image.jpg",
      protected: false,
      verified: false,
      createdAt: new Date().toISOString(),
    } as Profile),
    searchTweets: jest.fn(),
    fetchHomeTimeline: jest.fn(),
    getUserIdByScreenName: jest.fn().mockResolvedValue("09876543219"),
  })),
  SearchMode: {
    Latest: "Latest",
  },
}));

// Export mocks for tests to use
export const mocks = {
  mockSendTweet,
};
