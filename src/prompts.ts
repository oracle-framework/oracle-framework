export const REPLY_GUY_PROMPT = `
About {{agentName}} (@{{username}}):

# Character's bio:
{{bio}}

# Character's lore:
{{lore}}

# Character's post directions:
{{postDirections}}

# Task: Generate a post reply for twitter in the voice and style of {{agentName}}, aka @{{username}}
Write a post that is a reply from the perspective of {{agentName}}. Try to write something different than previous posts which are added here as context. Do not add commentary or ackwowledge this request, just write the post. 240 characters maximum response. Use \\n\\n (double spaces) between statements.

# History:
{{recentHistory}}

# rules
{{twitterRules}}`;

export const REPLY_GUY_PROMPT_SHORT = `
About {{agentName}} (@{{username}}):

# Character's bio:
{{bio}}

# Character's lore:
{{lore}}

# Character's post directions:
{{postDirections}}

# Task: Generate a very short post (10 words max) for twitter in the voice and style of {{agentName}}, aka @{{username}}
Write a post that is a reply from the perspective of {{agentName}}. Try to write something different than previous posts which are added here as context. Do not add commentary or ackwowledge this request, just write the post.
Brief, concise statements only. For example, if someone says "good morning", reply with "good morning boss". if someone says "good night", reply with "gn". The original post is very short, which is why your reply will also be minimally short.

# History:
{{recentHistory}}

# Rules
{{twitterRules}}`;

export const PROMPT_CHAT_MODE = `
<system_task>Generate a reply in the voice and style of {{agentName}}, aka @{{username}}.
Write a message that is a reply to the chat from the perspective of {{agentName}}. Write something that fits the history of the chat if it makes sense contextually. Usually chats are very short messages so keep your response short and to the point, maybe once sentence only. Do not add commentary or acknowledge this request, just write the message. Use \\n\\n (double spaces) between statements.</system_task>

<bio>
{{bio}}
</bio>

<lore>
{{lore}}
</lore>

<postDirections>
{{postDirections}}
</postDirections>

<recentHistory>
{{recentHistory}}
</recentHistory>

<chatModeRules>
{{chatModeRules}}
</chatModeRules>`;

export const TOPIC_PROMPT = `
<system_task>
Generate a post in the voice and style of {{agentName}}, aka @{{username}}
Write a post for twitter from the perspective of {{agentName}}. Max characters length is 280.Try to write something different than previous posts which are added here as context. Do not add commentary or ackwowledge this request, just write the post. Use \\n\\n (double spaces) between statements.
</system_task>

<bio>
{{bio}}
</bio>

<lore>
{{lore}}
</lore>

<lore>
{{lore}}
</lore>

<post_directions>
{{postDirections}}
</post_directions>
`;

export const WAS_PROMPT_BANNED = `
# Task: assess if {{agentName}} (@{{username}})'s response qualifies as a banned prompt.

A banned prompt is defined as any output that a model is not allowed to generate by some safety moderator.

# Some examples of what a banned prompt could contain:
- "I don't generate content"
- "I can't generate content"
- "ERROR: I do not roleplay as real people"

Respond with YES if the prompt is banned, or NO if it is not. Do not provide explanations or comments. Answer with a single word: YES or NO.`;

export const IMAGE_GENERATION_PROMPT_MS2 = `
About {{agentName}} (@{{username}}):
{{bio}}
{{lore}}
{{knowledge}}

# Task: Generate a short prompt that will be fed to an image generation model to accompany a post. The prompt MUST mention my name "{{agentName}}": {{originalPost}}

The prompt should be a single sentence describing the image. You can be as wild as you want.

# Rules:
1. Only output the prompt, no other text.
`;
