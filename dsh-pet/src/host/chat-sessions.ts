/** 多会话记忆的持久化类型与纯状态转换；读写介质和生成摘要在调用方完成。 */
import type { ChatSessionSummary } from '../shared/chat/commands.ts';
import type { ChatMemoryMessage } from './chat.ts';

/** 一次压缩的覆盖范围；消息正文仍完整保留。 */
export interface ChatCompaction {
  summary: string;
  throughMessageCount: number;
  compactedAt: number;
}

/** 一只宠物的一个持久化会话。 */
export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMemoryMessage[];
  compaction?: ChatCompaction;
}

/** 一只宠物的全部会话与当前选择。 */
export interface PetChatSessions {
  activeSessionId: string;
  sessions: ChatSession[];
}

/** 记忆文件的归一化形状。 */
export type ChatMemoryFile = Record<string, Record<string, PetChatSessions>>;

const LEGACY_SESSION_ID = 'legacy';
const TITLE_MAX_CHARACTERS = 40;

/** 创建带空消息列表的会话。 */
export function createChatSession(id: string, now: number): ChatSession {
  return { id, title: '新会话', createdAt: now, updatedAt: now, messages: [] };
}

/** 创建只有当前会话的宠物叶子。 */
export function createPetChatSessions(id: string, now: number): PetChatSessions {
  const session = createChatSession(id, now);
  return { activeSessionId: id, sessions: [session] };
}

/** 归一化整个记忆文件；旧叶子只在返回值中迁移，不改写输入。 */
export function normalizeChatMemory(raw: unknown): ChatMemoryFile {
  if (!isRecord(raw)) return {};
  const memory: ChatMemoryFile = {};
  for (const [entry, rawBucket] of Object.entries(raw)) {
    if (!isRecord(rawBucket)) continue;
    const bucket: Record<string, PetChatSessions> = {};
    for (const [petId, rawLeaf] of Object.entries(rawBucket)) {
      const leaf = normalizePetChatSessions(rawLeaf);
      if (leaf !== undefined) bucket[petId] = leaf;
    }
    memory[entry] = bucket;
  }
  return memory;
}

/** 归一化单只宠物叶子，并将旧 `{messages}` 映射为固定 `legacy` 会话。 */
export function normalizePetChatSessions(raw: unknown): PetChatSessions | undefined {
  if (!isRecord(raw)) return undefined;
  if (Array.isArray(raw.sessions)) return normalizeVersionTwo(raw);
  if (!Array.isArray(raw.messages)) return undefined;
  const messages = normalizeMessages(raw.messages);
  const session = createChatSession(LEGACY_SESSION_ID, firstTimestamp(messages));
  session.messages = messages;
  session.title = deriveTitle(messages);
  session.updatedAt = lastTimestamp(messages);
  return { activeSessionId: session.id, sessions: [session] };
}

/** 返回当前会话；空叶子或失效选择返回 `undefined`。 */
export function activeChatSession(leaf: PetChatSessions): ChatSession | undefined {
  return leaf.sessions.find((session) => session.id === leaf.activeSessionId);
}

/** 确保存在当前会话，由调用方提供随机 id 与时间。 */
export function ensureActiveChatSession(leaf: PetChatSessions, id: string, now: number): ChatSession {
  const existing = activeChatSession(leaf);
  if (existing !== undefined) return existing;
  const session = createChatSession(id, now);
  leaf.sessions.push(session);
  leaf.activeSessionId = id;
  return session;
}

/** 返回不含消息正文的会话元数据。 */
export function summarizeChatSession(session: ChatSession): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}

/** 追加一轮对话，并在首轮用用户消息生成标题。 */
export function appendChatTurn(
  session: ChatSession,
  user: ChatMemoryMessage,
  assistant: ChatMemoryMessage,
  now: number,
): void {
  const isFirstRound = !session.messages.some((message) => message.role === 'user');
  session.messages.push(user, assistant);
  if (isFirstRound) session.title = truncateTitle(user.content);
  session.updatedAt = now;
}

/** 返回生成对话所需的摘要与 cutoff 后最近若干轮。 */
export function chatSessionContext(
  session: ChatSession,
  rounds: number,
): { history: ChatMemoryMessage[]; contextSummary?: string } {
  const compaction = session.compaction;
  const start = compaction?.throughMessageCount ?? 0;
  const recent = session.messages.slice(start);
  const history = rounds === 0 ? [] : recent.slice(-rounds * 2);
  return { history, ...(compaction ? { contextSummary: compaction.summary } : {}) };
}

/** 用截至当前末尾的摘要更新 cutoff，不删除任何消息。 */
export function applyChatCompaction(session: ChatSession, summary: string, now: number): void {
  session.compaction = { summary, throughMessageCount: session.messages.length, compactedAt: now };
  session.updatedAt = now;
}

/** 删除命中时间戳的消息；删到 cutoff 前内容时使摘要失效。 */
export function removeChatRounds(session: ChatSession, timestamps: readonly number[]): number {
  const doomed = new Set(timestamps);
  const cutoff = session.compaction?.throughMessageCount ?? 0;
  const removedBeforeCutoff = session.messages.slice(0, cutoff).filter((message) => doomed.has(message.ts)).length;
  const before = session.messages.length;
  session.messages = session.messages.filter((message) => !doomed.has(message.ts));
  if (removedBeforeCutoff > 0) delete session.compaction;
  return before - session.messages.length;
}

function normalizeVersionTwo(raw: Record<string, unknown>): PetChatSessions {
  const rawSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  const sessions = rawSessions.flatMap((session) => {
    const normalized = normalizeSession(session);
    return normalized === undefined ? [] : [normalized];
  });
  const requestedActive = typeof raw.activeSessionId === 'string' ? raw.activeSessionId : '';
  const activeSessionId = sessions.some((session) => session.id === requestedActive)
    ? requestedActive
    : (sessions[0]?.id ?? '');
  return { activeSessionId, sessions };
}

function normalizeSession(raw: unknown): ChatSession | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '' || !Array.isArray(raw.messages)) return undefined;
  const messages = normalizeMessages(raw.messages);
  const createdAt = finiteNumber(raw.createdAt, firstTimestamp(messages));
  const session: ChatSession = {
    id: raw.id,
    title: typeof raw.title === 'string' && raw.title !== '' ? raw.title : deriveTitle(messages),
    createdAt,
    updatedAt: finiteNumber(raw.updatedAt, lastTimestamp(messages) || createdAt),
    messages,
  };
  const compaction = normalizeCompaction(raw.compaction, messages.length);
  if (compaction !== undefined) session.compaction = compaction;
  return session;
}

function normalizeCompaction(raw: unknown, messageCount: number): ChatCompaction | undefined {
  if (!isRecord(raw) || typeof raw.summary !== 'string' || raw.summary === '') return undefined;
  if (!Number.isInteger(raw.throughMessageCount) || !Number.isFinite(raw.compactedAt)) return undefined;
  const throughMessageCount = Number(raw.throughMessageCount);
  if (throughMessageCount < 0 || throughMessageCount > messageCount) return undefined;
  return { summary: raw.summary, throughMessageCount, compactedAt: Number(raw.compactedAt) };
}

function normalizeMessages(raw: readonly unknown[]): ChatMemoryMessage[] {
  return raw.flatMap((message) => {
    if (!isRecord(message)) return [];
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') return [];
    const ts = Number.isFinite(message.ts) ? Number(message.ts) : 0;
    return [{ ...message, ts } as unknown as ChatMemoryMessage];
  });
}

function deriveTitle(messages: readonly ChatMemoryMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  return firstUser === undefined ? '新会话' : truncateTitle(firstUser.content);
}

function truncateTitle(text: string): string {
  return Array.from(text.trim()).slice(0, TITLE_MAX_CHARACTERS).join('') || '新会话';
}

function firstTimestamp(messages: readonly ChatMemoryMessage[]): number {
  return messages[0]?.ts ?? 0;
}

function lastTimestamp(messages: readonly ChatMemoryMessage[]): number {
  return messages[messages.length - 1]?.ts ?? 0;
}

function finiteNumber(raw: unknown, fallback: number): number {
  return Number.isFinite(raw) ? Number(raw) : fallback;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
}
