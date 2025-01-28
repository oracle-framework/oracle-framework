export type CleanedTweet = {
  id: string;
  created_at: Date;
  text: string;
  user_id_str: string;
  user: string;
};

export interface Tweet {
  input_tweet_id: string;
  input_tweet_created_at: string;
  input_tweet_text: string;
  input_tweet_user_id: string;
  input_tweet_username?: string; // Twitter user's username
  new_tweet_id: string;
  prompt: string;
  new_tweet_text: string;
  created_at?: string;
  conversation_id?: string;
}
