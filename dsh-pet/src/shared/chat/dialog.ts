/**
 * 对话输入弹窗的挂载与生命周期：定位、关闭、发送。
 * 两端共用同一份实现；它只经注入的 baseUrl/surface 说话，不读配置、不读写记忆。
 * 桌面端把响应正文追加到当前轮并保留弹窗；网页端仍由 /state 气泡展示回复。
 * @module dsh-pet/src/shared/chat/dialog
 */
import { ROUTE_PATH } from '../constants.ts';
import { parseChatCommand } from './commands.ts';
import { createChatDom } from './dom.ts';
import type { EncodedImage } from './encode.ts';
import { sendChat, type ChatAttachment, type ChatSendState } from './send.ts';
import { CHAT_TRANSCRIPT_MAX_H, injectChatCss } from './styles.ts';
import { createChatTranscript } from './transcript.ts';

/** 对话弹窗挂载句柄。 */
export interface ChatDialogMount {
  /** 根元素（document.body 下） */
  el: HTMLElement;
  /** 关闭并清理（幂等） */
  close: () => void;
  /** 开录：快捷键「按住说话」按下时用（麦克风已在录、环境不支持时无动作）。 */
  startHear: () => void;
  /** 收尾：快捷键松开时用（没在录时无动作）。 */
  stopHear: () => void;
  /** 此刻是否真的在采集。 */
  isHearing: () => boolean;
  /** 放进一张已编码的图（截图快捷键在弹窗已开时走这条）；返回是否收下。 */
  setEncoded: (encoded: EncodedImage) => boolean;
  /** 放进一张图片文件（粘贴、拖拽在弹窗已开时走这条）；类型不接受或编码失败时返回 false。 */
  setImageFile: (file: File) => Promise<boolean>;
  /** 在弹窗里显示一条临时提示（截图失败这类原因，超时自动收起）。 */
  flash: (text: string) => void;
}

/** 发送接线需要的元素与回调。 */
interface SendBinding {
  readonly input: HTMLTextAreaElement;
  readonly err: HTMLElement;
  /** 已含 `?pet=&surface=` 的对话地址。 */
  readonly url: string;
  readonly isClosed: () => boolean;
  /** 发送开始时记录普通提问；会话命令不进入问答区。 */
  readonly onStart?: (text: string) => void;
  /** 发送成功并处理普通回复或会话效果。 */
  readonly onOk: (state: Extract<ChatSendState, { ok: true }>) => void | Promise<void>;
  /** 待发送的图片；没有就发纯文本。 */
  readonly attachment: () => ChatAttachment | undefined;
  /** 是否还在压缩图片：是的话先提示，别发出去把图丢掉。 */
  readonly isEncoding: () => boolean;
  /** 非错误提示（"图片还在处理"这类）。 */
  readonly notify: (text: string) => void;
}

/** 点弹窗外或按 Esc 关闭；补全菜单打开时 Esc 只收起菜单。 */
function bindDismiss(
  root: HTMLElement,
  isClosed: () => boolean,
  canDismiss: () => boolean,
  onDismiss: () => void,
): () => void {
  const onPointerDown = (e: MouseEvent): void => {
    if (isClosed() || root.contains(e.target as Node)) return;
    onDismiss();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && canDismiss()) onDismiss();
  };
  document.addEventListener('mousedown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    document.removeEventListener('mousedown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}

/** 回车或会话列表发送：成功后等待效果处理，失败把原因写进 err 行。 */
function bindSend(binding: SendBinding): (textOverride?: string) => Promise<void> {
  let sending = false;
  const doSend = async (textOverride?: string): Promise<void> => {
    if (binding.isClosed() || sending) return;
    if (binding.isEncoding()) {
      binding.notify('图片还在处理，稍等一下');
      return;
    }
    const text = (textOverride ?? binding.input.value).trim();
    if (!text) return;
    const attachment = textOverride === undefined ? binding.attachment() : undefined;
    sending = true;
    binding.input.disabled = true;
    binding.err.style.display = 'none';
    binding.onStart?.(text);
    try {
      const state = await sendChat(binding.url, text, attachment);
      if (state.ok) await binding.onOk(state);
      else {
        binding.err.textContent = '对话失败：' + (state.message ?? state.reason);
        binding.err.style.display = 'block';
      }
    } catch (error) {
      binding.err.textContent =
        '对话异常：' + String(error && (error as Error).message ? (error as Error).message : error);
      binding.err.style.display = 'block';
    } finally {
      sending = false;
      binding.input.disabled = false;
      if (!binding.isClosed()) binding.input.focus();
    }
  };
  binding.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void doSend();
    }
  });
  return doSend;
}

/**
 * 由对话地址推导识别地址：两端传进来的都是 `.../chat`，去掉尾段换成 `/voice/hear`。
 *
 * @param baseUrl - 已含挂载前缀的对话地址。
 * @returns 同前缀下的识别地址。
 */
function hearUrlOf(baseUrl: string): string {
  return baseUrl.replace(/\/chat$/, '') + '/voice/hear';
}

/** 挂载对话弹窗的入参。 */
export interface ChatDialogOptions {
  petId: string;
  /** 端点基址：浏览器默认相对路径，桌面传绝对 URL（file:// 页面需要绝对）。 */
  baseUrl?: string;
  /** 这个弹窗开在哪一端：POST /chat 的 ?surface= 是必填的，宿主据此提前拒掉不可能的组合。 */
  surface: 'web' | 'desktop';
  x: number;
  y: number;
  /** 发送成功后调用；桌面弹窗仍打开，网页弹窗已关闭。 */
  onSent?: () => void;
  onClose?: () => void;
  /** 拉伸开始时持有桌面输入租约，结束后释放。 */
  onResizeActive?: (active: boolean) => void;
  /** 弹窗允许占用的矩形（视口局部坐标）；缺省 = 整个视口。 */
  clamp?: { x: number; y: number; w: number; h: number };
  /** 打开时就带着的图片（拖拽落到宠物身上走的这条）；缺省 = 空弹窗。 */
  initialImage?: File;
  /** 打开时就带着的已编码图片（截图快捷键走的这条：截屏没有 File，只有 base64）。 */
  initialEncoded?: EncodedImage;
  /** 截屏实现：浏览器传 getDisplayMedia 抓帧，桌面传 preload 的 IPC 调用；缺省 = 不支持。 */
  capture?: () => Promise<EncodedImage>;
  /**
   * 识别地址；缺省按 `baseUrl` 去掉尾部 `/chat` 推导（两端传进来的都是 `.../chat`）。
   * 给了也用不上时（环境不能录音）按钮不出现，见 createChatDom。
   */
  hearUrl?: string;
}

/** 挂载对话弹窗并夹回可视区域；桌面端发送后保留当前轮，网页端发送后关闭。 */
export function mountChatDialog(opts: ChatDialogOptions): ChatDialogMount {
  injectChatCss();
  const { petId, surface, x, y, onSent, onClose, clamp } = opts;
  const baseUrl = opts.baseUrl ?? ROUTE_PATH + '/chat';
  // `surface` 必填（宿主校验）；这个 URL 只用于 POST 发送——GET 读记忆那条路不需要它
  const withPet = baseUrl + '?pet=' + encodeURIComponent(petId) + '&surface=' + surface;
  const c =
    clamp && Number.isFinite(clamp.x + clamp.y + clamp.w + clamp.h)
      ? clamp
      : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };

  const dom = createChatDom({
    capture: opts.capture,
    hearUrl: opts.hearUrl ?? hearUrlOf(baseUrl),
    maxWidth: () => c.w - 8,
    maxHeight: () => c.h - 8,
    onLayout: () => place(),
    onResizeActive: opts.onResizeActive,
  });
  const { root, input, err } = dom;
  root.dataset.surface = surface;

  /** 以 (x,y) 落点，超出 clamp 矩形夹回。 */
  const place = (): void => {
    const r = root.getBoundingClientRect();
    root.style.left = Math.max(c.x + 4, Math.min(x, c.x + c.w - r.width - 4)) + 'px';
    root.style.top = Math.max(c.y + 4, Math.min(y, c.y + c.h - r.height - 4)) + 'px';
    root.dataset.resized = root.style.height ? '1' : '0';
    if (transcript) {
      transcript.el.style.maxHeight = root.style.height ? 'none' : CHAT_TRANSCRIPT_MAX_H + 'px';
      if (root.style.height) transcript.el.style.height = 'auto';
    }
  };

  const transcript = surface === 'desktop' ? createChatTranscript({ baseUrl, petId, onLayout: place }) : undefined;
  if (transcript) root.prepend(transcript.el);

  let closed = false;
  let unbindDismiss = (): void => {};
  const close = (): void => {
    if (closed) return;
    closed = true;
    unbindDismiss();
    transcript?.dispose();
    dom.dispose();
    dom.clearAttach();
    root.remove();
    if (onClose) onClose();
  };
  unbindDismiss = bindDismiss(
    root,
    () => closed,
    () => !dom.isCommandMenuOpen(),
    close,
  );
  const send = bindSend({
    input,
    err,
    url: withPet,
    isClosed: () => closed,
    onStart: (text) => {
      dom.hideSessions();
      if (transcript) {
        if (!parseChatCommand(text)) transcript.appendUser(text);
        input.value = '';
        dom.clearAttach();
        dom.resizeInput();
      }
      place();
    },
    onOk: async (state) => {
      const effect = state.effect;
      if (effect?.kind === 'resume-list') {
        dom.showSessions(effect.sessions, effect.activeSessionId, (sessionId) => void send('resume ' + sessionId));
      } else if (effect) {
        if (effect.kind === 'new') transcript?.clear();
        if (effect.kind === 'resume') await transcript?.reload();
        dom.flash(state.text);
        if (!transcript) close();
      } else {
        if (transcript) transcript.appendReply(state.text);
        else close();
      }
      place();
      if (onSent) onSent();
    },
    attachment: () => dom.getAttachment(),
    isEncoding: () => dom.isEncoding(),
    notify: (text) => dom.flash(text),
  });

  dom.resizeInput();
  place();
  if (transcript) {
    void transcript.load().catch((error: unknown) => {
      if (closed) return;
      err.textContent = '历史读取失败：' + (error instanceof Error ? error.message : String(error));
      err.style.display = 'block';
      place();
    });
  }
  if (opts.initialImage) void dom.setImageFile(opts.initialImage);
  if (opts.initialEncoded) dom.setEncoded(opts.initialEncoded);
  input.focus();
  return {
    el: root,
    close,
    startHear: dom.startHear,
    stopHear: dom.stopHear,
    isHearing: dom.isHearing,
    setEncoded: dom.setEncoded,
    setImageFile: dom.setImageFile,
    flash: dom.flash,
  };
}
