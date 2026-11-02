import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ChatMemoryInput } from './plugin/chat-memory.ts';
import { createChatMemory } from './plugin/chat-memory.ts';
import type { ChatMemoryFile } from './chat-sessions.ts';
import type { ConfigPaths } from './config.ts';

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-commands-test-'));
  const configPaths: ConfigPaths = {
    defaultFile: fileURLToPath(new URL('../../assets/config.jsonc', import.meta.url)),
    userFile: join(dir, 'main-config.jsonc'),
    petDir: join(dir, 'pet'),
  };
  writeFileSync(configPaths.userFile, '{}');
  return { dir, configPaths, userRoot: join(dir, 'user') };
}

function fakeCtx(replies: Array<string | Error>, captured: Record<string, unknown>[]) {
  return {
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'current' }) },
    llm: {
      stream: (options: unknown) => {
        captured.push(options as Record<string, unknown>);
        const reply = replies.shift() ?? '缺省回复';
        return (async function* () {
          if (reply instanceof Error) throw reply;
          yield { type: 'text-delta', index: 0, text: reply };
        })();
      },
    },
  };
}

function setup(replies: Array<string | Error> = []) {
  const ws = workspace();
  const captured: Record<string, unknown>[] = [];
  const memory = createChatMemory({
    ctx: fakeCtx(replies, captured),
    configPaths: ws.configPaths,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    memeDirsFor: () => [],
    playback: { create: () => ({ playbackId: 'pb' }) },
    state: { writePet: () => {} },
    userRoot: ws.userRoot,
  } as unknown as ChatMemoryInput);
  return { ...ws, captured, memory };
}

function readDisk(userRoot: string): ChatMemoryFile {
  return JSON.parse(readFileSync(join(userRoot, 'memory.json'), 'utf8')) as ChatMemoryFile;
}

function onlyLeaf(userRoot: string) {
  const leaf = readDisk(userRoot).main?.main;
  assert.ok(leaf);
  return leaf;
}

function requestMessages(options: Record<string, unknown> | undefined): Array<{ content: unknown }> {
  return (options?.messages ?? []) as Array<{ content: unknown }>;
}

describe('runChatCommand —— 创建、列表与切换', () => {
  test('new 创建并切换，resume 列表带元数据，resume id 切回', async () => {
    const suite = setup(['第一句回复']);
    try {
      const created = await suite.memory.runChatCommand('main', { kind: 'new' });
      assert.equal(created.ok, true);
      const firstId = created.ok && created.effect.kind === 'new' ? created.effect.sessionId : '';
      assert.equal(onlyLeaf(suite.userRoot).sessions.length, 1, '空宠物执行 new 只能创建一个会话');

      await suite.memory.chatWithPet('main', '首轮用户标题');
      const second = await suite.memory.runChatCommand('main', { kind: 'new' });
      const secondId = second.ok && second.effect.kind === 'new' ? second.effect.sessionId : '';
      assert.notEqual(secondId, firstId);
      assert.equal(onlyLeaf(suite.userRoot).activeSessionId, secondId);

      const listed = await suite.memory.runChatCommand('main', { kind: 'resume' });
      assert.equal(listed.ok, true);
      if (listed.ok && listed.effect.kind === 'resume-list') {
        assert.equal(listed.effect.activeSessionId, secondId);
        assert.deepEqual(
          listed.effect.sessions.map((session) => session.id),
          [firstId, secondId],
        );
        assert.equal(listed.effect.sessions[0]?.title, '首轮用户标题');
        assert.equal(listed.effect.sessions[0]?.messageCount, 2);
      } else {
        assert.fail('resume 无参应返回列表');
      }

      const resumed = await suite.memory.runChatCommand('main', { kind: 'resume', sessionId: firstId });
      assert.equal(resumed.ok, true);
      assert.equal(onlyLeaf(suite.userRoot).activeSessionId, firstId);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });

  test('resume 不存在的 id：bad-request 且不改 active', async () => {
    const suite = setup();
    try {
      await suite.memory.runChatCommand('main', { kind: 'new' });
      const before = readFileSync(join(suite.userRoot, 'memory.json'), 'utf8');
      const result = await suite.memory.runChatCommand('main', { kind: 'resume', sessionId: 'missing' });
      assert.equal(result.ok === false && result.reason, 'bad-request');
      assert.equal(readFileSync(join(suite.userRoot, 'memory.json'), 'utf8'), before);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });

  test('resume 列表读取旧格式：返回 legacy，但不主动重写文件', async () => {
    const suite = setup();
    mkdirSync(suite.userRoot, { recursive: true });
    const raw = JSON.stringify({ main: { main: { messages: [{ role: 'user', content: '旧问', ts: 1 }] } } });
    writeFileSync(join(suite.userRoot, 'memory.json'), raw);
    try {
      const result = await suite.memory.runChatCommand('main', { kind: 'resume' });
      assert.equal(result.ok, true);
      if (result.ok && result.effect.kind === 'resume-list') {
        assert.equal(result.effect.activeSessionId, 'legacy');
        assert.equal(result.effect.sessions[0]?.title, '旧问');
      }
      assert.equal(readFileSync(join(suite.userRoot, 'memory.json'), 'utf8'), raw);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });
  test('无历史时 resume 返回空列表，不创建会话或文件', async () => {
    const suite = setup();
    try {
      const result = await suite.memory.runChatCommand('main', { kind: 'resume' });
      assert.equal(result.ok, true);
      if (result.ok && result.effect.kind === 'resume-list') {
        assert.equal(result.effect.activeSessionId, '');
        assert.deepEqual(result.effect.sessions, []);
      } else {
        assert.fail('resume 无参应返回列表');
      }
      assert.throws(() => readDisk(suite.userRoot), /ENOENT/);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });
});

describe('runChatCommand —— compact', () => {
  test('空会话拒绝，不调用模型也不创建文件', async () => {
    const suite = setup();
    try {
      const result = await suite.memory.runChatCommand('main', { kind: 'compact' });
      assert.equal(result.ok === false && result.reason, 'bad-request');
      assert.equal(suite.captured.length, 0);
      assert.throws(() => readDisk(suite.userRoot), /ENOENT/);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });

  test('压缩保留完整消息；后续聊天与再次压缩都带摘要和 cutoff 后消息', async () => {
    const suite = setup(['第一答', '第一摘要', '第二答', '第二摘要']);
    try {
      await suite.memory.chatWithPet('main', '第一问');
      const compacted = await suite.memory.runChatCommand('main', { kind: 'compact' });
      assert.equal(compacted.ok, true);
      const session = onlyLeaf(suite.userRoot).sessions[0];
      assert.equal(session?.messages.length, 2);
      assert.equal(session?.compaction?.summary, '第一摘要');
      assert.equal(session?.compaction?.throughMessageCount, 2);

      await suite.memory.chatWithPet('main', '第二问');
      assert.match(String(suite.captured[2]?.system), /\[会话摘要\]\n第一摘要/);
      assert.equal(requestMessages(suite.captured[2]).length, 1, 'cutoff 后尚无消息，只发当前用户输入');

      await suite.memory.runChatCommand('main', { kind: 'compact' });
      assert.match(String(suite.captured[3]?.system), /第一摘要/);
      assert.equal(requestMessages(suite.captured[3]).length, 3, '再次压缩只回放 cutoff 后一轮和压缩指令');
      assert.equal(onlyLeaf(suite.userRoot).sessions[0]?.messages.length, 4);
      assert.equal(onlyLeaf(suite.userRoot).sessions[0]?.compaction?.throughMessageCount, 4);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });

  test('上次压缩后没有新消息：拒绝重复 compact，不调用模型或写盘', async () => {
    const suite = setup(['正常回复', '摘要']);
    try {
      await suite.memory.chatWithPet('main', '问题');
      await suite.memory.runChatCommand('main', { kind: 'compact' });
      const before = readFileSync(join(suite.userRoot, 'memory.json'), 'utf8');
      const calls = suite.captured.length;
      const result = await suite.memory.runChatCommand('main', { kind: 'compact' });
      assert.equal(result.ok === false && result.reason, 'bad-request');
      assert.equal(suite.captured.length, calls);
      assert.equal(readFileSync(join(suite.userRoot, 'memory.json'), 'utf8'), before);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });

  test('模型失败：保留原文件，不写半截压缩', async () => {
    const suite = setup(['正常回复', new Error('provider down')]);
    try {
      await suite.memory.chatWithPet('main', '问题');
      const before = readFileSync(join(suite.userRoot, 'memory.json'), 'utf8');
      const result = await suite.memory.runChatCommand('main', { kind: 'compact' });
      assert.equal(result.ok, false);
      assert.equal(readFileSync(join(suite.userRoot, 'memory.json'), 'utf8'), before);
    } finally {
      rmSync(suite.dir, { recursive: true, force: true });
    }
  });
});
