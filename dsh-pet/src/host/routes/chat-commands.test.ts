import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { ChatCommand } from '../../shared/chat/commands.ts';
import { normalizeChatMemory } from '../chat-sessions.ts';
import { handleChatRoutes } from './chat.ts';
import type { PetRouteDeps, RouteInput } from './types.ts';

function makeDeps(rawMemory: unknown = {}) {
  const commands: Array<{ petId: string; command: ChatCommand }> = [];
  const chats: string[] = [];
  const deps = {
    configPaths: {},
    log: { error: () => {}, info: () => {}, warn: () => {} },
    memoryPath: '/tmp/memory.json',
    memoryRounds: () => 5,
    readMemory: async () => normalizeChatMemory(rawMemory),
    requirePet: () => ({ ok: true, petId: 'main', entry: 'main', conf: {} }),
    optionalService: () => {
      throw new Error('命令不得进入附件准入');
    },
    chatWithPet: async (_petId: string, text: string) => {
      chats.push(text);
      return { ok: true as const, text: '普通回复' };
    },
    runChatCommand: async (petId: string, command: ChatCommand) => {
      commands.push({ petId, command });
      if (command.kind === 'resume' && command.sessionId === undefined) {
        return {
          ok: true as const,
          text: '会话列表',
          effect: { kind: 'resume-list' as const, activeSessionId: 'a', sessions: [] },
        };
      }
      const kind =
        command.kind === 'new' || command.kind === 'resume' || command.kind === 'compact' ? command.kind : 'new';
      return { ok: true as const, text: '命令完成', effect: { kind, sessionId: 's-1' } };
    },
  } as unknown as PetRouteDeps;
  return { deps, commands, chats };
}

function post(text: string, attachment?: unknown): RouteInput {
  return {
    url: new URL('http://127.0.0.1/chat?pet=main&surface=web'),
    rest: 'chat',
    method: 'POST',
    body: JSON.stringify({ text, ...(attachment === undefined ? {} : { attachment }) }),
  };
}

function get(): RouteInput {
  return { url: new URL('http://127.0.0.1/chat?pet=main'), rest: 'chat', method: 'GET' };
}

function body(result: Awaited<ReturnType<typeof handleChatRoutes>>): Record<string, unknown> {
  assert.equal(result?.kind, 'json');
  return (result as { obj: Record<string, unknown> }).obj;
}

describe('POST /chat —— 会话命令拦截', () => {
  test('new、/resume、compact 及带 id 的 resume 在 chatWithPet 前拦截', async () => {
    const suite = makeDeps();
    for (const text of ['new', '/resume', 'compact', 'resume session-id']) {
      const result = body(await handleChatRoutes(suite.deps, post(text)));
      assert.equal(result.ok, true, text);
      assert.equal(result.text, text === '/resume' ? '会话列表' : '命令完成');
      assert.ok(result.effect, '命令响应必须带 effect');
    }
    assert.deepEqual(
      suite.commands.map((call) => call.command),
      [{ kind: 'new' }, { kind: 'resume' }, { kind: 'compact' }, { kind: 'resume', sessionId: 'session-id' }],
    );
    assert.deepEqual(suite.chats, []);
  });

  test('命中命令名但参数非法：bad-request，不进入命令服务或普通聊天', async () => {
    const suite = makeDeps();
    const result = body(await handleChatRoutes(suite.deps, post('new unexpected')));
    assert.equal(result.reason, 'bad-request');
    assert.deepEqual(suite.commands, []);
    assert.deepEqual(suite.chats, []);
  });

  test('命令带附件：附件准入前 bad-request', async () => {
    const suite = makeDeps();
    const result = body(await handleChatRoutes(suite.deps, post('/compact', { mediaType: 'bad' })));
    assert.equal(result.reason, 'bad-request');
    assert.match(String(result.message), /不支持附件/);
    assert.deepEqual(suite.commands, []);
    assert.deepEqual(suite.chats, []);
  });

  test('普通文本仍走 chatWithPet，响应不带 effect', async () => {
    const suite = makeDeps();
    const result = body(await handleChatRoutes(suite.deps, post('普通聊天')));
    assert.deepEqual(result, { ok: true, text: '普通回复' });
    assert.deepEqual(suite.chats, ['普通聊天']);
    assert.deepEqual(suite.commands, []);
  });
});

describe('GET /chat —— active 会话', () => {
  test('旧 messages seed：返回 legacy active、消息与元数据', async () => {
    const suite = makeDeps({
      main: {
        main: {
          messages: [{ role: 'user', content: '旧问题', ts: 100 }],
        },
      },
    });
    const result = body(await handleChatRoutes(suite.deps, get()));
    assert.equal(result.activeSessionId, 'legacy');
    assert.deepEqual(result.messages, [{ role: 'user', content: '旧问题', ts: 100 }]);
    assert.deepEqual(result.session, {
      id: 'legacy',
      title: '旧问题',
      createdAt: 100,
      updatedAt: 100,
      messageCount: 1,
    });
  });

  test('v2 多会话：只返回 active 的消息', async () => {
    const suite = makeDeps({
      main: {
        main: {
          activeSessionId: 'b',
          sessions: [
            { id: 'a', title: '甲', createdAt: 1, updatedAt: 1, messages: [{ role: 'user', content: '甲问', ts: 1 }] },
            { id: 'b', title: '乙', createdAt: 2, updatedAt: 2, messages: [{ role: 'user', content: '乙问', ts: 2 }] },
          ],
        },
      },
    });
    const result = body(await handleChatRoutes(suite.deps, get()));
    assert.equal(result.activeSessionId, 'b');
    assert.deepEqual(result.messages, [{ role: 'user', content: '乙问', ts: 2 }]);
  });

  test('没有任何会话：允许空 messages，同时给出新 active 元数据', async () => {
    const suite = makeDeps();
    const result = body(await handleChatRoutes(suite.deps, get()));
    assert.deepEqual(result.messages, []);
    assert.equal(typeof result.activeSessionId, 'string');
    assert.equal((result.session as { messageCount: number }).messageCount, 0);
  });
});
