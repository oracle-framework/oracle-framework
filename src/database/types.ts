export interface Tweet {
  idStr: string;
  userIdStr: string;
  userScreenName: string;
  fullText: string;
  conversationIdStr: string;
  tweetCreatedAt: string;
  inReplyToStatusIdStr?: string;
  inReplyToUserIdStr?: string;
  inReplyToScreenName?: string;
  characterIdStr?: string;
}

export interface DbTweet {
  id_str: string;
  user_id_str: string;
  user_screen_name: string;
  full_text: string;
  conversation_id_str: string;
  tweet_created_at: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  in_reply_to_screen_name?: string;
  character_id_str?: string;
}

export interface Prompt {
  tweetIdStr: string;
  prompt: string;
}
