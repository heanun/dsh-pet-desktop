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

/** 解析 new/resume/compact 及其斜杠别名；其它输入返回 undefined。 */
export function parseChatCommand(text: string): ChatCommand | undefined {
  const matched = /^\/?(new|resume|compact)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!matched) return undefined;
  const name = matched[1];
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
