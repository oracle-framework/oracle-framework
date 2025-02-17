export interface TwitterCreateTweetResponse {
  data?: {
    create_tweet: {
      tweet_results: {
        result: {
          rest_id: string;
          core: {
            user_results: {
              result: {
                id: string;
                rest_id: string;
                legacy: {
                  screen_name: string;
                }
              }
            }
          }
          legacy: {
            created_at: string;
            conversation_id_str: string;
            full_text: string;
            user_id_str: string;
            id_str: string;
            in_reply_to_status_id_str?: string;
            in_reply_to_user_id_str?: string;
            in_reply_to_screen_name?: string;
          }
        }
      }
    }
  };
  errors?: Array<{
    message: string;
    code: string;
  }>;
}

export interface Tweet {
  id_str: string;
  user_id_str: string;
  user_screen_name: string;
  full_text: string;
  conversation_id_str: string;
  tweet_created_at: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  in_reply_to_screen_name?: string;
}