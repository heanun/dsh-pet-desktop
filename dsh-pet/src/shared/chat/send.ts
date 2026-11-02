/**
 * 对话发送：把一句输入交给宿主 `POST /chat`，带回成败与回复正文。
 * 回复仍会写入 `/state` 的 `pets.<id>.say`；桌面弹窗直接使用响应正文组成当前轮。
 * @module dsh-pet/src/shared/chat/send
 */
import { parseChatCommandEffect, type ChatCommandEffect } from './commands.ts';

/** 随消息发送的一张图片：`data` 是规范 base64（不带 data: 前缀）。 */
export interface ChatAttachment {
  readonly mediaType: string;
  readonly data: string;
}

/** 发送回执：成功时带回复正文与可选会话效果，失败时带归一化原因。 */
export type ChatSendState =
  | { ok: true; text: string; effect?: ChatCommandEffect }
  | { ok: false; reason: 'provider-missing' | 'generate-error' | 'config-error' | 'bad-request'; message?: string };

/** 对话要等 LLM 生成回复，比碎碎念（30s）放宽一倍 */
const SEND_TIMEOUT_MS = 60_000;

/**
 * 发送一句对话（携带记忆去宿主生成回复并写入记忆）。
 * 网络或解析失败显式抛错，调用方决定报错方式，绝不静默伪造回复。
 *
 * @param baseUrl - 已含 `?pet=&surface=` 的完整对话地址。
 * @param text - 用户输入正文（宿主会 trim 并校验 2000 字上限）。
 * @param attachment - 可选的一张图片；不传时请求体只有 `text`，与旧版逐字一致。
 * @returns 成功时带回复正文，失败时带归一化原因与文案。
 * @throws 响应不是 JSON 对象时。
 */
export async function sendChat(baseUrl: string, text: string, attachment?: ChatAttachment): Promise<ChatSendState> {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(attachment ? { text, attachment } : { text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const raw: unknown = await res.json().catch(() => null);
  if (!raw || typeof raw !== 'object') {
    throw new Error('dsh-pet: 对话响应非法');
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    return {
      ok: false,
      reason:
        o.reason === 'provider-missing' || o.reason === 'generate-error' || o.reason === 'config-error'
          ? o.reason
          : 'bad-request',
      message: typeof o.message === 'string' ? o.message : undefined,
    };
  }
  const effect = parseChatCommandEffect(o.effect);
  return { ok: true, text: typeof o.text === 'string' ? o.text : '', ...(effect ? { effect } : {}) };
}
