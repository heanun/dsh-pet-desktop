/** 会话列表项；只含展示元数据，不带消息正文。 */
export interface ChatSessionSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messageCount: number;
}

/** 会话命令成功后的客户端效果。 */
export type ChatCommandEffect =
  | { readonly kind: 'new' | 'resume' | 'compact'; readonly sessionId: string }
  | {
      readonly kind: 'resume-list';
      readonly activeSessionId: string;
      readonly sessions: readonly ChatSessionSummary[];
    };

/** 解析后的会话命令；invalid 表示命中命令名但参数不合法。 */
export type ChatCommand =
  | { readonly kind: 'new' }
  | { readonly kind: 'resume'; readonly sessionId?: string }
  | { readonly kind: 'compact' }
  | { readonly kind: 'invalid'; readonly message: string };

/** 斜杠命令的补全展示信息。 */
export interface ChatCommandCompletion {
  readonly name: 'new' | 'resume' | 'compact';
  readonly usage: string;
  readonly description: string;
}

const CHAT_COMMAND_COMPLETIONS: readonly ChatCommandCompletion[] = [
  { name: 'new', usage: '/new', description: '新建会话' },
  { name: 'resume', usage: '/resume [session-id]', description: '恢复历史会话' },
  { name: 'compact', usage: '/compact', description: '压缩当前会话上下文' },
];

/** 返回斜杠命令候选；输入参数或普通文本时不弹出补全。 */
export function listChatCommandCompletions(text: string): readonly ChatCommandCompletion[] {
  if (!text.startsWith('/') || /\s/.test(text)) return [];
  const query = text.slice(1);
  return CHAT_COMMAND_COMPLETIONS.filter((completion) => completion.name.startsWith(query));
}

/** 解析 new/resume/compact 及其斜杠别名；其它输入返回 undefined。 */
export function parseChatCommand(text: string): ChatCommand | undefined {
  const matched = /^\/?([a-z]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!matched) return undefined;
  const completion = CHAT_COMMAND_COMPLETIONS.find((item) => item.name === matched[1]);
  if (!completion) return undefined;
  const name = completion.name;
  const argument = matched[2]?.trim() ?? '';
  if (name === 'resume') {
    if (/\s/.test(argument)) return { kind: 'invalid', message: '用法：resume [session-id]' };
    return argument ? { kind: 'resume', sessionId: argument } : { kind: 'resume' };
  }
  if (argument) return { kind: 'invalid', message: `用法：${name}` };
  return name === 'new' ? { kind: 'new' } : { kind: 'compact' };
}

/** 校验宿主返回的命令效果；形状不完整时按无效果处理。 */
export function parseChatCommandEffect(raw: unknown): ChatCommandEffect | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const effect = raw as Record<string, unknown>;
  if (
    (effect.kind === 'new' || effect.kind === 'resume' || effect.kind === 'compact') &&
    typeof effect.sessionId === 'string' &&
    effect.sessionId !== ''
  ) {
    return { kind: effect.kind, sessionId: effect.sessionId };
  }
  if (effect.kind !== 'resume-list' || typeof effect.activeSessionId !== 'string' || !Array.isArray(effect.sessions)) {
    return undefined;
  }
  const sessions: ChatSessionSummary[] = [];
  for (const item of effect.sessions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const session = item as Record<string, unknown>;
    if (
      typeof session.id !== 'string' ||
      typeof session.title !== 'string' ||
      !Number.isFinite(session.createdAt) ||
      !Number.isFinite(session.updatedAt) ||
      !Number.isInteger(session.messageCount) ||
      Number(session.messageCount) < 0
    ) {
      return undefined;
    }
    sessions.push({
      id: session.id,
      title: session.title,
      createdAt: Number(session.createdAt),
      updatedAt: Number(session.updatedAt),
      messageCount: Number(session.messageCount),
    });
  }
  return { kind: 'resume-list', activeSessionId: effect.activeSessionId, sessions };
}
