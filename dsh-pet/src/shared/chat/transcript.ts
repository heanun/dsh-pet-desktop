/**
 * 桌面对话的终端式问答区：读取历史快照、追加当前轮并保持最新轮可见。
 * 不写记忆、不调用模型；数据只来自现有 /chat 接口。
 * 弹窗打开后产生的消息由本地轮次负责，历史快照必须排除它们，避免重复渲染。
 * @module dsh-pet/src/shared/chat/transcript
 */
import { CHAT_TRANSCRIPT_MAX_H } from './styles.ts';

const HISTORY_ROUNDS = 200;
const HISTORY_TIMEOUT_MS = 10_000;

/** 一轮问答；同一轮的用户与助手消息共享时间戳。 */
export interface ChatTranscriptRound {
  readonly ts: number;
  readonly user?: string;
  readonly assistant?: string;
}

/** 桌面问答区的挂载句柄。 */
export interface ChatTranscript {
  readonly el: HTMLDivElement;
  readonly load: () => Promise<void>;
  /** 清空历史与本地轮次，并使在途加载失效。 */
  readonly clear: () => void;
  /** 切换到另一会话后完整重载，不按弹窗打开时间过滤。 */
  readonly reload: () => Promise<void>;
  readonly appendUser: (text: string) => void;
  readonly appendReply: (text: string) => void;
  readonly dispose: () => void;
}

/**
 * 把历史响应整理成轮次；无效条目直接丢弃。
 *
 * @param body - GET /chat 的响应体。
 * @param openedAtMs - 弹窗打开时间；此后写入的消息由本地轮次展示。
 * @returns 按原顺序排列的历史轮次。
 */
export function parseTranscriptHistory(body: unknown, openedAtMs: number): ChatTranscriptRound[] {
  const raw = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(raw)) return [];
  const rounds: ChatTranscriptRound[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const message = item as Record<string, unknown>;
    const role = message.role === 'user' || message.role === 'assistant' ? message.role : undefined;
    if (role === undefined || typeof message.content !== 'string') continue;
    const ts = typeof message.ts === 'number' && Number.isFinite(message.ts) && message.ts >= 0 ? message.ts : 0;
    if (ts !== 0 && ts >= openedAtMs) continue;
    const last = rounds[rounds.length - 1];
    if (last !== undefined && ts !== 0 && last.ts === ts) {
      rounds[rounds.length - 1] =
        role === 'user' ? { ...last, user: message.content } : { ...last, assistant: message.content };
    } else {
      rounds.push(role === 'user' ? { ts, user: message.content } : { ts, assistant: message.content });
    }
  }
  return rounds;
}

function messageElement(role: 'user' | 'assistant', text: string): HTMLDivElement {
  const line = document.createElement('div');
  line.className = 'dsh-pet-chat-message';
  line.dataset.role = role;
  line.textContent = role === 'user' ? '> ' + text : text;
  return line;
}

function roundElement(round: ChatTranscriptRound): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dsh-pet-chat-round';
  if (round.user !== undefined) el.appendChild(messageElement('user', round.user));
  if (round.assistant !== undefined) el.appendChild(messageElement('assistant', round.assistant));
  return el;
}

/** 创建桌面问答区；加载历史与本地追加可以交错进行。 */
export function createChatTranscript(opts: { baseUrl: string; petId: string; onLayout: () => void }): ChatTranscript {
  const el = document.createElement('div');
  el.className = 'dsh-pet-chat-transcript';
  el.dataset.empty = '1';
  el.style.maxHeight = CHAT_TRANSCRIPT_MAX_H + 'px';
  const openedAtMs = Date.now();
  let history: ChatTranscriptRound[] = [];
  let local: ChatTranscriptRound[] = [];
  let activeRequest: AbortController | undefined;
  let requestEpoch = 0;
  let disposed = false;

  const render = (): void => {
    if (disposed) return;
    const rounds = [...history, ...local];
    el.replaceChildren(...rounds.map(roundElement));
    el.dataset.empty = rounds.length === 0 ? '1' : '0';
    const latest = el.lastElementChild as HTMLElement | null;
    el.style.height = latest === null ? '0px' : Math.min(latest.scrollHeight, CHAT_TRANSCRIPT_MAX_H) + 'px';
    el.scrollTop = el.scrollHeight;
    opts.onLayout();
  };
  const clear = (): void => {
    requestEpoch += 1;
    activeRequest?.abort();
    activeRequest = undefined;
    history = [];
    local = [];
    render();
  };
  const loadHistory = async (cutoffMs: number): Promise<void> => {
    if (disposed) return;
    const epoch = ++requestEpoch;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = window.setTimeout(() => controller.abort(), HISTORY_TIMEOUT_MS);
    try {
      const joiner = opts.baseUrl.includes('?') ? '&' : '?';
      const url = opts.baseUrl + joiner + 'pet=' + encodeURIComponent(opts.petId) + '&rounds=' + HISTORY_ROUNDS;
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error('chat HTTP ' + res.status);
      const parsed = parseTranscriptHistory(await res.json(), cutoffMs);
      if (disposed || epoch !== requestEpoch) return;
      history = parsed;
      render();
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest === controller) activeRequest = undefined;
    }
  };

  return {
    el,
    load: () => loadHistory(openedAtMs),
    clear,
    reload: () => {
      clear();
      return loadHistory(Number.POSITIVE_INFINITY);
    },
    appendUser: (text) => {
      local.push({ ts: 0, user: text });
      render();
    },
    appendReply: (text) => {
      const current = local[local.length - 1];
      if (current === undefined) return;
      local[local.length - 1] = { ...current, assistant: text };
      render();
    },
    dispose: () => {
      disposed = true;
      requestEpoch += 1;
      activeRequest?.abort();
    },
  };
}
