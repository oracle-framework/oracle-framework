export interface Tweet {
  input_tweet_id: string;
  input_tweet_created_at: string;
  input_tweet_text: string;
  input_tweet_user_id: string;
  new_tweet_id: string;
  prompt: string;
  new_tweet_text: string;
  created_at?: string;
  in_reply_to_status_id?: string;
  conversation_id?: string;
}
