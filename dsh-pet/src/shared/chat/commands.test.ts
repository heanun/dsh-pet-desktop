import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseChatCommand, parseChatCommandEffect } from './commands.ts';

describe('parseChatCommand', () => {
  test('三个命令及斜杠别名 → 正确解析', () => {
    assert.deepEqual(parseChatCommand('new'), { kind: 'new' });
    assert.deepEqual(parseChatCommand('/compact'), { kind: 'compact' });
    assert.deepEqual(parseChatCommand(' resume '), { kind: 'resume' });
    assert.deepEqual(parseChatCommand('/resume abc-123'), { kind: 'resume', sessionId: 'abc-123' });
  });

  test('命令带多余参数 → invalid，不落入普通聊天', () => {
    assert.deepEqual(parseChatCommand('new later'), { kind: 'invalid', message: '用法：new' });
    assert.deepEqual(parseChatCommand('compact all'), { kind: 'invalid', message: '用法：compact' });
    assert.deepEqual(parseChatCommand('resume one two'), { kind: 'invalid', message: '用法：resume [session-id]' });
  });

  test('普通文本和未知命令 → undefined', () => {
    for (const text of ['你好', 'newer', '/help', 'resume-note', '']) {
      assert.equal(parseChatCommand(text), undefined);
    }
  });
});

describe('parseChatCommandEffect', () => {
  test('单会话效果 → 原样校验返回', () => {
    assert.deepEqual(parseChatCommandEffect({ kind: 'new', sessionId: 's1' }), { kind: 'new', sessionId: 's1' });
  });

  test('会话列表 → 返回完整展示元数据', () => {
    const effect = {
      kind: 'resume-list',
      activeSessionId: 's1',
      sessions: [{ id: 's1', title: '讨论', createdAt: 1, updatedAt: 2, messageCount: 4 }],
    };
    assert.deepEqual(parseChatCommandEffect(effect), effect);
  });

  test('缺字段或负数消息数 → undefined', () => {
    assert.equal(parseChatCommandEffect({ kind: 'new' }), undefined);
    assert.equal(
      parseChatCommandEffect({
        kind: 'resume-list',
        activeSessionId: '',
        sessions: [{ id: 's1', title: '坏', createdAt: 1, updatedAt: 2, messageCount: -1 }],
      }),
      undefined,
    );
  });
});
