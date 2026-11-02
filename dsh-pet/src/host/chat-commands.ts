/** 会话命令的串行编排：切换当前会话，或调用当前聊天模型更新压缩摘要。 */
import { randomUUID } from 'node:crypto';

import type { ChatCommand, ChatCommandEffect } from '../shared/chat/commands.ts';
import { generateChat } from './chat.ts';
import {
  applyChatCompaction,
  createChatSession,
  ensureActiveChatSession,
  summarizeChatSession,
  type ChatMemoryFile,
  type PetChatSessions,
} from './chat-sessions.ts';
import { findPetInstance, readAllConfig, type ConfigPaths } from './config.ts';
import { configuredModel } from './model-selection.ts';

const COMPACT_INSTRUCTION =
  '请压缩当前对话，保留后续交流所需的事实、约定、用户偏好与未完成事项。只输出摘要正文，不要复述指令。';

/** 会话命令的结构化结果。 */
export type ChatCommandResult =
  | { ok: true; text: string; effect: ChatCommandEffect }
  | { ok: false; reason: 'provider-missing' | 'generate-error' | 'unknown-pet' | 'bad-request'; message?: string };

/** 命令编排依赖；锁由记忆所有者提供。 */
export interface ChatCommandDeps {
  readonly ctx: Parameters<typeof generateChat>[0]['ctx'];
  readonly configPaths: ConfigPaths;
  readonly readMemory: () => Promise<ChatMemoryFile>;
  readonly writeMemory: (memory: ChatMemoryFile) => Promise<void>;
  readonly withLock: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly petSystemPrompt: (found: { conf: Record<string, unknown>; pet: Record<string, unknown> }) => string;
}

/** 创建会话命令入口。 */
export function createChatCommands(deps: ChatCommandDeps) {
  const runChatCommand = (petId: string, command: ChatCommand): Promise<ChatCommandResult> =>
    deps.withLock(async () => {
      const cfg = readAllConfig(deps.configPaths);
      const found = findPetInstance(cfg, petId);
      if (!found) return { ok: false, reason: 'unknown-pet', message: '没有这只桌宠：' + petId };
      const memory = await deps.readMemory();
      const bucket = (memory[found.entry] ??= {});
      const leaf = (bucket[petId] ??= { activeSessionId: '', sessions: [] });
      if (command.kind === 'invalid') return { ok: false, reason: 'bad-request', message: command.message };
      if (command.kind === 'new') return createSession(memory, leaf, command.kind);
      if (command.kind === 'resume') return resumeSession(memory, leaf, command.sessionId);
      return compactSession(memory, leaf, found, command.kind);
    });

  async function createSession(memory: ChatMemoryFile, leaf: PetChatSessions, kind: 'new'): Promise<ChatCommandResult> {
    const now = Date.now();
    const session = createChatSession(randomUUID(), now);
    leaf.sessions.push(session);
    leaf.activeSessionId = session.id;
    await deps.writeMemory(memory);
    return success(kind, session.id, '已创建并切换到新会话');
  }

  async function resumeSession(
    memory: ChatMemoryFile,
    leaf: PetChatSessions,
    sessionId?: string,
  ): Promise<ChatCommandResult> {
    if (sessionId === undefined) {
      return {
        ok: true,
        text: '会话列表',
        effect: {
          kind: 'resume-list',
          activeSessionId: leaf.activeSessionId,
          sessions: leaf.sessions.map(summarizeChatSession),
        },
      };
    }
    const session = leaf.sessions.find((candidate) => candidate.id === sessionId);
    if (session === undefined) return { ok: false, reason: 'bad-request', message: '会话不存在：' + sessionId };
    leaf.activeSessionId = session.id;
    await deps.writeMemory(memory);
    return success('resume', session.id, '已切换会话');
  }

  async function compactSession(
    memory: ChatMemoryFile,
    leaf: PetChatSessions,
    found: { conf: Record<string, unknown>; pet: Record<string, unknown> },
    kind: 'compact',
  ): Promise<ChatCommandResult> {
    const session = ensureActiveChatSession(leaf, randomUUID(), Date.now());
    if (session.messages.length === 0) {
      return { ok: false, reason: 'bad-request', message: '当前会话为空，无法压缩' };
    }
    const cutoff = session.compaction?.throughMessageCount ?? 0;
    if (cutoff >= session.messages.length) {
      return { ok: false, reason: 'bad-request', message: '自上次压缩后没有新消息' };
    }
    const generated = await generateChat({
      ctx: deps.ctx,
      system: deps.petSystemPrompt(found),
      history: session.messages.slice(cutoff),
      userText: COMPACT_INSTRUCTION,
      preferred: configuredModel(found.conf, 'chatModel'),
      ...(session.compaction ? { contextSummary: session.compaction.summary } : {}),
    });
    if (!generated.ok) return generated;
    applyChatCompaction(session, generated.text, Date.now());
    await deps.writeMemory(memory);
    return success(kind, session.id, '已压缩当前会话');
  }

  return { runChatCommand };
}

function success(kind: 'new' | 'resume' | 'compact', sessionId: string, text: string): ChatCommandResult {
  return { ok: true, text, effect: { kind, sessionId } };
}
