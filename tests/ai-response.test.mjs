import assert from 'node:assert/strict';
import {
  appendTruncationNotice,
  getAiReplyMaxTokens,
  trimConversationContent,
} from '../lib/ai-response.mjs';

async function run() {
  {
    assert.equal(getAiReplyMaxTokens({}), 2400);
  }

  {
    assert.equal(getAiReplyMaxTokens({ AI_REPLY_MAX_TOKENS: '3200' }), 3200);
  }

  {
    assert.equal(getAiReplyMaxTokens({ AI_REPLY_MAX_TOKENS: '200' }), 2400);
    assert.equal(getAiReplyMaxTokens({ AI_REPLY_MAX_TOKENS: '99999' }), 2400);
    assert.equal(getAiReplyMaxTokens({ AI_REPLY_MAX_TOKENS: 'abc' }), 2400);
  }

  {
    const reply = appendTruncationNotice('第一段分析。', 'end_turn');
    assert.equal(reply, '第一段分析。');
  }

  {
    const reply = appendTruncationNotice('第一段分析。', 'max_tokens');
    assert.match(reply, /第一段分析。/);
    assert.match(reply, /回覆太長已被系統截斷/);
    assert.match(reply, /繼續/);
  }

  {
    const content = 'x'.repeat(13000);
    assert.equal(trimConversationContent(content).length, 12000);
  }

  console.log('ai response helper contract: PASS (6 cases)');
}

run().catch(err => { console.error(err); process.exit(1); });
