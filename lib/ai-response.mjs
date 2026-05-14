const DEFAULT_AI_REPLY_MAX_TOKENS = 2400;
const MIN_AI_REPLY_MAX_TOKENS = 1024;
const MAX_AI_REPLY_MAX_TOKENS = 4096;
const CONVERSATION_SAVE_LIMIT = 12000;

export function getAiReplyMaxTokens(env = process.env) {
  const parsed = Number(env.AI_REPLY_MAX_TOKENS);
  if (
    Number.isInteger(parsed)
    && parsed >= MIN_AI_REPLY_MAX_TOKENS
    && parsed <= MAX_AI_REPLY_MAX_TOKENS
  ) {
    return parsed;
  }
  return DEFAULT_AI_REPLY_MAX_TOKENS;
}

export function appendTruncationNotice(reply, stopReason) {
  if (stopReason !== 'max_tokens') return reply;
  return `${reply.trimEnd()}\n\n（回覆太長已被系統截斷。你可以叫我「繼續」，我會接住上一段繼續分析；或者叫我「縮短重整」，我會濃縮成完整版本。）`;
}

export function trimConversationContent(content) {
  return content.trim().slice(0, CONVERSATION_SAVE_LIMIT);
}
