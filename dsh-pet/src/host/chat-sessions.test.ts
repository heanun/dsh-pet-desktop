import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  activeChatSession,
  appendChatTurn,
  applyChatCompaction,
  chatSessionContext,
  createPetChatSessions,
  ensureActiveChatSession,
  normalizeChatMemory,
  normalizePetChatSessions,
  removeChatRounds,
  summarizeChatSession,
} from './chat-sessions.ts';

function message(role: 'user' | 'assistant', content: string, ts: number) {
  return { role, content, ts };
}

describe('normalizePetChatSessions', () => {
  test('旧 messages 叶子：映射到 legacy，保留正文且不改输入', () => {
    const legacy = { messages: [message('user', '第一问', 10), message('assistant', '第一答', 10)] };
    const normalized = normalizePetChatSessions(legacy);
    assert.equal(normalized?.activeSessionId, 'legacy');
    assert.deepEqual(normalized?.sessions[0]?.messages, legacy.messages);
    assert.equal(normalized?.sessions[0]?.title, '第一问');
    assert.deepEqual(legacy, { messages: [message('user', '第一问', 10), message('assistant', '第一答', 10)] });
  });

  test('旧消息缺少 ts：正文仍保留并沿用历史展示的时间戳兜底', () => {
    const normalized = normalizePetChatSessions({ messages: [{ role: 'user', content: '无时间旧问' }] });
    assert.deepEqual(normalized?.sessions[0]?.messages, [{ role: 'user', content: '无时间旧问', ts: 0 }]);
  });

  test('v2 叶子：保留多个会话、当前选择与合法压缩信息', () => {
    const normalized = normalizePetChatSessions({
      activeSessionId: 'b',
      sessions: [
        { id: 'a', title: '甲', createdAt: 1, updatedAt: 2, messages: [] },
        {
          id: 'b',
          title: '乙',
          createdAt: 3,
          updatedAt: 4,
          messages: [message('user', '问', 5)],
          compaction: { summary: '摘要', throughMessageCount: 1, compactedAt: 6 },
        },
      ],
    });
    assert.equal(normalized?.sessions.length, 2);
    assert.equal(activeChatSession(normalized!)?.id, 'b');
    assert.equal(activeChatSession(normalized!)?.compaction?.summary, '摘要');
  });

  test('整个文件：不同宠物分别归一化', () => {
    const memory = normalizeChatMemory({
      entry: {
        first: { messages: [message('user', '一', 1)] },
        second: {
          activeSessionId: 's',
          sessions: [{ id: 's', title: '二', createdAt: 2, updatedAt: 2, messages: [] }],
        },
      },
    });
    assert.equal(memory.entry?.first?.activeSessionId, 'legacy');
    assert.equal(memory.entry?.second?.activeSessionId, 's');
  });
});

describe('会话创建与追加', () => {
  test('空叶子按需创建当前会话', () => {
    const leaf = { activeSessionId: '', sessions: [] };
    const session = ensureActiveChatSession(leaf, 'random-id', 100);
    assert.equal(session.id, 'random-id');
    assert.equal(leaf.activeSessionId, 'random-id');
    assert.deepEqual(session.messages, []);
  });

  test('首轮用户消息生成标题并截断，元数据随追加更新', () => {
    const leaf = createPetChatSessions('s', 1);
    const session = activeChatSession(leaf)!;
    appendChatTurn(session, message('user', `  ${'很'.repeat(50)}  `, 2), message('assistant', '答', 2), 2);
    assert.equal(session.title, '很'.repeat(40));
    assert.equal(session.createdAt, 1);
    assert.equal(session.updatedAt, 2);
    assert.deepEqual(summarizeChatSession(session), {
      id: 's',
      title: '很'.repeat(40),
      createdAt: 1,
      updatedAt: 2,
      messageCount: 2,
    });
  });
});

describe('chatSessionContext', () => {
  test('压缩后：返回摘要与 cutoff 后最近 N 轮，完整消息不动', () => {
    const leaf = createPetChatSessions('s', 1);
    const session = activeChatSession(leaf)!;
    session.messages = [message('user', '旧问', 1), message('assistant', '旧答', 1)];
    applyChatCompaction(session, '旧摘要', 2);
    session.messages.push(
      message('user', '新一问', 2),
      message('assistant', '新一答', 2),
      message('user', '新二问', 3),
      message('assistant', '新二答', 3),
    );
    const context = chatSessionContext(session, 1);
    assert.equal(context.contextSummary, '旧摘要');
    assert.deepEqual(
      context.history.map((item) => item.content),
      ['新二问', '新二答'],
    );
    assert.equal(session.messages.length, 6);
  });

  test('无压缩：保持原最近 N 轮行为，rounds=0 为空', () => {
    const session = activeChatSession(createPetChatSessions('s', 1))!;
    session.messages = [message('user', '一', 1), message('assistant', '二', 1), message('user', '三', 2)];
    assert.deepEqual(
      chatSessionContext(session, 1).history.map((item) => item.content),
      ['二', '三'],
    );
    assert.deepEqual(chatSessionContext(session, 0).history, []);
    assert.equal(chatSessionContext(session, 5).contextSummary, undefined);
  });
});

describe('removeChatRounds', () => {
  function compactedSession() {
    const session = activeChatSession(createPetChatSessions('s', 1))!;
    session.messages = [message('user', '旧问', 100), message('assistant', '旧答', 100)];
    applyChatCompaction(session, '摘要', 150);
    session.messages.push(message('user', '新问', 200), message('assistant', '新答', 200));
    return session;
  }

  test('只删 cutoff 后消息：压缩仍有效', () => {
    const session = compactedSession();
    assert.equal(removeChatRounds(session, [200]), 2);
    assert.equal(session.compaction?.summary, '摘要');
    assert.deepEqual(
      session.messages.map((item) => item.content),
      ['旧问', '旧答'],
    );
  });

  test('删到 cutoff 前消息：压缩失效', () => {
    const session = compactedSession();
    assert.equal(removeChatRounds(session, [100]), 2);
    assert.equal(session.compaction, undefined);
    assert.deepEqual(
      session.messages.map((item) => item.content),
      ['新问', '新答'],
    );
  });
});
