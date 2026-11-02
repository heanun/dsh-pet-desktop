/**
 * 对话弹窗的 DOM 装配：输入框、上传/截屏/按住说话三枚按钮、待发送图片缩略图、提示行与错误行。
 * 只建元素并把能力接上，不发送、不定位、不管关闭；录音的状态机在 chat/hear-control。
 * @module dsh-pet/src/shared/chat/dom
 */
import { type EncodedImage, encodeImageFile } from './encode.ts';
import { createHearControl } from './hear-control.ts';
import { IMAGE_ACCEPT, firstImageFromClipboard, isImageFile } from './image-pick.ts';
import { cameraIcon, micIcon, pictureIcon } from './icons.ts';
import type { ChatSessionSummary } from './commands.ts';
import { createChatResizeDriver } from './resize.ts';
import type { ChatAttachment } from './send.ts';

/** 提示自动收起的时间（ms）。 */
const HINT_MS = 2200;

/** 弹窗用到的元素与行为；挂载函数只按需接线，不重新造 DOM。 */
export interface ChatDom {
  readonly root: HTMLDivElement;
  readonly input: HTMLTextAreaElement;
  readonly err: HTMLDivElement;
  readonly shotBtn: HTMLButtonElement;
  /** 未手动拖宽时随文本调整宽度；输入只调整 textarea 高度，不覆盖手动根高度。 */
  readonly resizeInput: () => void;
  /** 清掉待发送图片（含 file input 的值）。 */
  readonly clearAttach: () => void;
  /** 放进一张待发送图片（上传、拖拽、粘贴共用）；类型不接受或编码失败时提示并返回 false。 */
  readonly setImageFile: (file: File) => Promise<boolean>;
  /** 放进一张已编码好的图（截屏走这条：没有 File，只有 base64）。 */
  readonly setEncoded: (encoded: EncodedImage) => boolean;
  /** 当前待发送的图片；没有时 undefined。 */
  readonly getAttachment: () => ChatAttachment | undefined;
  /** 是否正在编码：发送前要等它结束，否则这条消息会漏掉图片。 */
  readonly isEncoding: () => boolean;
  /** 临时提示（不是错误），超时自动收起。 */
  readonly flash: (text: string) => void;
  /** 显示会话选择列表；选择某个会话时调用 onSelect。 */
  readonly showSessions: (
    sessions: readonly ChatSessionSummary[],
    activeSessionId: string,
    onSelect: (sessionId: string) => void,
  ) => void;
  /** 收起会话选择列表。 */
  readonly hideSessions: () => void;
  /** 从外部开录（快捷键「按住说话」用）；录不了时给一句原因，已在录时什么都不做。 */
  readonly startHear: () => void;
  /** 从外部收尾（快捷键松手用）；没在录时什么都不做。 */
  readonly stopHear: () => void;
  /** 此刻是否真的在采集；全局快捷键据此把「开/关」合成一个动作。 */
  readonly isHearing: () => boolean;
  /** 收起提示、停掉正在进行的录音并清计时器；关闭弹窗时调用。 */
  readonly dispose: () => void;
}

/** 造一枚图标按钮（图标 + 无障碍标签）。 */
function iconButton(title: string, icon: SVGElement): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dsh-pet-chat-btn';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.appendChild(icon);
  return btn;
}

/**
 * 建好弹窗的全部元素并挂到 `document.body` 下。
 *
 * @param opts - 可选的截屏实现（不传时按钮只给"当前环境不支持"的提示）与识别地址
 *   （录不了时按住说话的按钮照样在，点它给一句原因）。
 * @returns 元素引用与行为（清理附件、临时提示、自适应、释放计时器）。
 */
export function createChatDom(
  opts: {
    capture?: () => Promise<EncodedImage>;
    hearUrl?: string;
    maxWidth?: () => number;
    maxHeight?: () => number;
    onLayout?: () => void;
  } = {},
): ChatDom {
  const root = document.createElement('div');
  root.className = 'dsh-pet-chat';

  const input = document.createElement('textarea');
  input.className = 'dsh-pet-chat-input';
  input.placeholder = '说点什么…';
  input.maxLength = 2000;
  input.rows = 1;

  const err = document.createElement('div');
  err.className = 'dsh-pet-chat-err';
  err.style.display = 'none';

  const hint = document.createElement('div');
  hint.className = 'dsh-pet-chat-hint';
  let hintTimer = 0;
  /** 常驻提示：录音与识别期间一直显示，由调用点自己收。 */
  const showHint = (text: string): void => {
    window.clearTimeout(hintTimer);
    hint.textContent = text;
    hint.style.display = 'block';
  };
  const hideHint = (): void => {
    window.clearTimeout(hintTimer);
    hint.style.display = 'none';
  };
  const flash = (text: string): void => {
    showHint(text);
    hintTimer = window.setTimeout(hideHint, HINT_MS);
  };

  const sessionPanel = document.createElement('div');
  sessionPanel.className = 'dsh-pet-chat-sessions';
  sessionPanel.dataset.on = '0';
  const hideSessions = (): void => {
    sessionPanel.dataset.on = '0';
    sessionPanel.replaceChildren();
  };
  const showSessions = (
    sessions: readonly ChatSessionSummary[],
    activeSessionId: string,
    onSelect: (sessionId: string) => void,
  ): void => {
    sessionPanel.replaceChildren();
    if (sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dsh-pet-chat-session-empty';
      empty.textContent = '没有可恢复的会话';
      sessionPanel.appendChild(empty);
    }
    for (const session of sessions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dsh-pet-chat-session';
      button.disabled = session.id === activeSessionId;
      const title = document.createElement('span');
      title.className = 'dsh-pet-chat-session-title';
      title.textContent = session.title;
      const meta = document.createElement('span');
      meta.className = 'dsh-pet-chat-session-meta';
      const current = button.disabled ? '当前 · ' : '';
      meta.textContent = `${current}${new Date(session.updatedAt).toLocaleString()} · ${session.messageCount} 条 · ${session.id.slice(0, 8)}`;
      button.append(title, meta);
      button.addEventListener('click', () => onSelect(session.id));
      sessionPanel.appendChild(button);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dsh-pet-chat-session-cancel';
    cancel.textContent = '取消';
    cancel.addEventListener('click', hideSessions);
    sessionPanel.appendChild(cancel);
    sessionPanel.dataset.on = '1';
  };

  const pickBtn = iconButton('上传图片', pictureIcon());
  const shotBtn = iconButton('截取当前屏幕', cameraIcon());
  const hearUrl = typeof opts.hearUrl === 'string' ? opts.hearUrl : '';
  const micBtn = iconButton('按住说话', micIcon());
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = IMAGE_ACCEPT;
  fileInput.style.display = 'none';

  const attach = document.createElement('div');
  attach.className = 'dsh-pet-chat-attach';
  const thumb = document.createElement('img');
  thumb.className = 'dsh-pet-chat-thumb';
  thumb.alt = '已选图片';
  const attachX = document.createElement('button');
  attachX.type = 'button';
  attachX.className = 'dsh-pet-chat-attach-x';
  attachX.textContent = '✕';
  attachX.title = '移除图片';
  attachX.setAttribute('aria-label', '移除图片');
  attach.append(thumb, attachX);

  const actions = document.createElement('div');
  actions.className = 'dsh-pet-chat-actions';
  actions.append(pickBtn, shotBtn, micBtn, fileInput, attach);

  const createResizeHandle = (direction: 'e' | 's' | 'se', label: string): HTMLDivElement => {
    const handle = document.createElement('div');
    handle.className = `dsh-pet-chat-resize dsh-pet-chat-resize-${direction}`;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', label);
    if (direction === 'e') handle.setAttribute('aria-orientation', 'vertical');
    if (direction === 's') handle.setAttribute('aria-orientation', 'horizontal');
    handle.tabIndex = 0;
    return handle;
  };
  const resizeHandles = {
    right: createResizeHandle('e', '调整聊天框宽度'),
    bottom: createResizeHandle('s', '调整聊天框高度'),
    corner: createResizeHandle('se', '调整聊天框宽度和高度'),
  };

  root.append(input, sessionPanel, actions, hint, err, resizeHandles.right, resizeHandles.bottom, resizeHandles.corner);
  document.body.appendChild(root);

  const resize = createChatResizeDriver({
    root,
    input,
    handles: resizeHandles,
    maxWidth: opts.maxWidth ?? (() => window.innerWidth - 8),
    maxHeight: opts.maxHeight ?? (() => window.innerHeight - 8),
    onLayout: opts.onLayout ?? (() => {}),
  });
  const resizeInput = resize.resizeInput;

  let attachment: ChatAttachment | undefined;
  let encoding = false;
  let capturing = false;
  const clearAttach = (): void => {
    attachment = undefined;
    attach.dataset.on = '0';
    thumb.removeAttribute('src');
    fileInput.value = '';
  };
  /** 把编码结果挂上去：上传与截屏两条路共用这一处落点。 */
  const applyEncoded = (encoded: EncodedImage): boolean => {
    if (!root.isConnected) return false; // 编码完成前弹窗已关
    attachment = { mediaType: encoded.mediaType, data: encoded.base64 };
    thumb.src = encoded.previewUrl;
    attach.dataset.on = '1';
    return true;
  };
  const setImageFile = async (file: File): Promise<boolean> => {
    if (!isImageFile(file)) {
      flash('只支持 PNG / JPEG / WebP / GIF');
      return false;
    }
    encoding = true;
    pickBtn.disabled = true;
    try {
      return applyEncoded(await encodeImageFile(file));
    } catch (e) {
      flash('读图失败：' + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      encoding = false;
      pickBtn.disabled = false;
    }
  };

  pickBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) void setImageFile(file);
  });
  attachX.addEventListener('click', clearAttach);
  // 粘贴图片：截图工具通常先把图放剪贴板，Ctrl+V 比"存盘再选文件"少两步。
  // 挂在根元素上而不是输入框：焦点可能停在 ✕ / 按钮上，事件照样冒泡到这里；纯文本不拦截。
  root.addEventListener('paste', (e) => {
    const file = firstImageFromClipboard(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    void setImageFile(file);
  });
  // 截屏：有实现就抓一帧（流在实现里立刻停掉，不留长连接）；没有就说明当前环境不支持
  if (opts.capture) {
    const capture = opts.capture;
    shotBtn.addEventListener('click', () => {
      if (capturing) return;
      capturing = true;
      shotBtn.disabled = true;
      void capture()
        .then((encoded) => applyEncoded(encoded))
        .catch((e) => flash('截屏失败：' + (e instanceof Error ? e.message : String(e))))
        .finally(() => {
          capturing = false;
          shotBtn.disabled = false;
        });
    });
  } else {
    shotBtn.addEventListener('click', () => flash('当前环境不支持截屏，先用上传试试'));
  }

  // 按住说话：状态机、录音与结果落点都在 chat/hear-control，这里只把元素与提示行交过去。
  const hear = createHearControl({
    micBtn,
    input,
    hint: { show: showHint, hide: hideHint, flash },
    resizeInput,
    hearUrl,
  });

  resizeInput(); // 以占位符为初始宽度

  return {
    root,
    input,
    err,
    shotBtn,
    resizeInput,
    clearAttach,
    setImageFile,
    setEncoded: applyEncoded,
    getAttachment: () => attachment,
    isEncoding: () => encoding || capturing,
    flash,
    showSessions,
    hideSessions,
    startHear: hear.start,
    stopHear: hear.stop,
    isHearing: hear.isHearing,
    dispose: () => {
      window.clearTimeout(hintTimer);
      resize.dispose();
      hear.dispose();
    },
  };
}
