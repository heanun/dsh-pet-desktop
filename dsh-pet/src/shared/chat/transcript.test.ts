import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { parseTranscriptHistory } from './transcript.ts';

describe('桌面问答历史', () => {
  test('同一时间戳的用户与助手消息合成一轮', () => {
    const rounds = parseTranscriptHistory(
      {
        messages: [
          { role: 'user', content: '第一问', ts: 10 },
          { role: 'assistant', content: '第一答', ts: 10 },
          { role: 'user', content: '第二问', ts: 20 },
          { role: 'assistant', content: '第二答', ts: 20 },
        ],
      },
      100,
    );
    assert.deepEqual(rounds, [
      { ts: 10, user: '第一问', assistant: '第一答' },
      { ts: 20, user: '第二问', assistant: '第二答' },
    ]);
  });

  test('排除弹窗打开后写入的消息，避免与本地当前轮重复', () => {
    const rounds = parseTranscriptHistory(
      {
        messages: [
          { role: 'user', content: '旧问题', ts: 99 },
          { role: 'assistant', content: '旧回复', ts: 99 },
          { role: 'user', content: '新问题', ts: 100 },
          { role: 'assistant', content: '新回复', ts: 101 },
        ],
      },
      100,
    );
    assert.deepEqual(rounds, [{ ts: 99, user: '旧问题', assistant: '旧回复' }]);
  });

  test('无时间戳的旧消息保留但不互相并轮', () => {
    const rounds = parseTranscriptHistory(
      {
        messages: [
          { role: 'user', content: '问题' },
          { role: 'assistant', content: '回复' },
        ],
      },
      100,
    );
    assert.deepEqual(rounds, [{ ts: 0, user: '问题' }, { ts: 0, assistant: '回复' }]);
  });

  test('非法响应和非法消息按空历史或丢弃处理', () => {
    assert.deepEqual(parseTranscriptHistory(null, 100), []);
    assert.deepEqual(
      parseTranscriptHistory(
        {
          messages: [
            null,
            { role: 'system', content: '忽略' },
            { role: 'user', content: 1 },
            { role: 'user', content: '有效' },
          ],
        },
        100,
      ),
      [{ ts: 0, user: '有效' }],
    );
  });
});
