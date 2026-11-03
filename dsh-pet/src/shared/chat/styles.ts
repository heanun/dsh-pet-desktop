/**
 * 对话弹窗的样式与尺寸参数：两端注入同一份 CSS。
 * 只放静态字符串与常量，不建 DOM、不读运行时状态。
 * @module dsh-pet/src/shared/chat/styles
 */

/** 弹窗样式：网页端为自适应输入框，桌面端另有可滚动的当前轮问答区。 */
export const CHAT_CSS = [
  '.dsh-pet-chat{position:fixed;z-index:2147483001;width:160px;display:flex;flex-direction:column;overflow:hidden;',
  'background:rgba(255,255,255,.98);border:1px solid rgba(0,0,0,.12);border-radius:10px;',
  'box-shadow:0 10px 32px rgba(0,0,0,.22);color:#2b2b2b;font-size:14px;line-height:1.5;',
  // 字体跟随桌宠全局配置；字号不继承气泡配置。
  "font-family:var(--dsh-pet-font-family,'ShangshouSoftCandy','Yuanti SC','YouYuan','幼圆','Comic Sans MS','PingFang SC','Microsoft YaHei',sans-serif);",
  'user-select:none}',
  '.dsh-pet-chat *{box-sizing:border-box}',
  '.dsh-pet-chat-input,.dsh-pet-chat-actions,.dsh-pet-chat-sessions,.dsh-pet-chat-hint,.dsh-pet-chat-err{flex:none}',
  '.dsh-pet-chat-transcript{display:none;flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;user-select:text;',
  'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.55) transparent}',
  '.dsh-pet-chat[data-resized="1"] .dsh-pet-chat-transcript{flex:1 1 auto}',
  '.dsh-pet-chat-transcript[data-empty="0"]{display:block}',
  '.dsh-pet-chat-round{padding:8px 11px 0}',
  '.dsh-pet-chat-round:last-child{padding-bottom:8px}',
  '.dsh-pet-chat-message{white-space:pre-wrap;overflow-wrap:anywhere}',
  '.dsh-pet-chat-message[data-role="user"]{margin-bottom:4px;color:rgba(255,255,255,.72)}',
  '.dsh-pet-chat-message[data-role="assistant"]{color:#fff}',
  '.dsh-pet-chat-input{display:block;width:100%;border:none;outline:none;background:transparent;',
  'padding:8px 11px 9px;font-size:14px;line-height:1.45;color:#2b2b2b;font-family:inherit;',
  'resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}',
  '.dsh-pet-chat-input::placeholder{color:rgba(43,43,43,.45)}',
  '.dsh-pet-chat-input:disabled{opacity:.55}',
  // 操作行：上传 / 截屏 / 按住说话三枚图标按钮（无边框、悬停才显底）
  '.dsh-pet-chat-actions{display:flex;align-items:center;gap:6px;padding:0 8px 7px}',
  '.dsh-pet-chat-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;',
  'border:none;border-radius:6px;background:transparent;color:rgba(43,43,43,.62);font-size:14px;line-height:1;',
  'cursor:pointer;transition:background .15s,color .15s}',
  '.dsh-pet-chat-btn:hover{background:rgba(0,0,0,.06);color:rgba(43,43,43,.9)}',
  '.dsh-pet-chat-btn:disabled{opacity:.45;cursor:default}',
  '.dsh-pet-chat-btn svg{display:block}',
  // 话筒：录音中常亮红底 + 呼吸，告诉用户「正在听」。状态由 dom 写在 data-hear 上。
  '.dsh-pet-chat-btn[data-hear="recording"]{color:#e5484d;background:rgba(229,72,77,.14)}',
  '.dsh-pet-chat-btn[data-hear="recording"]:hover{background:rgba(229,72,77,.2);color:#e5484d}',
  '.dsh-pet-chat-btn[data-hear="recording"] svg{animation:dsh-pet-hear-pulse 1s ease-in-out infinite}',
  '@keyframes dsh-pet-hear-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
  // 已选图片：跟在两枚按钮右侧的一枚小图，不占额外一行
  '.dsh-pet-chat-attach{display:none;align-items:center;gap:4px;margin-left:2px}',
  '.dsh-pet-chat-attach[data-on="1"]{display:inline-flex}',
  '.dsh-pet-chat-thumb{width:24px;height:24px;object-fit:cover;border-radius:4px;',
  'border:1px solid rgba(0,0,0,.1);flex:0 0 auto;background:rgba(0,0,0,.06)}',
  '.dsh-pet-chat-attach-x{border:none;background:transparent;color:rgba(43,43,43,.45);cursor:pointer;',
  'font-size:12px;line-height:1;padding:2px 3px;border-radius:4px}',
  '.dsh-pet-chat-attach-x:hover{background:rgba(0,0,0,.08);color:rgba(43,43,43,.85)}',
  '.dsh-pet-chat-hint{display:none;color:rgba(43,43,43,.55);font-size:12px;padding:0 12px 8px}',
  '.dsh-pet-chat-err{color:#d94f3d;font-size:12px;padding:0 12px 8px;white-space:pre-wrap;overflow-wrap:anywhere}',
  '.dsh-pet-chat-sessions{display:none;max-height:180px;overflow-y:auto;padding:0 8px 6px;user-select:text}',
  '.dsh-pet-chat-sessions[data-on="1"]{display:block}',
  '.dsh-pet-chat-session{display:block;width:100%;padding:7px 8px;border:none;border-radius:6px;',
  'background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}',
  '.dsh-pet-chat-session:hover:not(:disabled),.dsh-pet-chat-session:focus-visible{background:rgba(0,0,0,.06);outline:none}',
  '.dsh-pet-chat-session:disabled{opacity:.58;cursor:default}',
  '.dsh-pet-chat-session-title,.dsh-pet-chat-session-meta{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsh-pet-chat-session-meta{margin-top:2px;font-size:11px;opacity:.72}',
  '.dsh-pet-chat-session-empty{padding:6px 8px;font-size:12px;opacity:.65}',
  '.dsh-pet-chat-session-cancel{display:block;margin:3px 0 0 auto;padding:3px 6px;border:none;background:transparent;',
  'color:inherit;font:inherit;font-size:12px;cursor:pointer}',
  '.dsh-pet-chat-commands{display:none;max-height:180px;overflow-y:auto;padding:0 8px 6px;user-select:text}',
  '.dsh-pet-chat-commands[data-on="1"]{display:block}',
  '.dsh-pet-chat-command{display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border:none;border-radius:6px;',
  'background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}',
  '.dsh-pet-chat-command[data-selected="1"],.dsh-pet-chat-command:hover{background:rgba(0,0,0,.06)}',
  '.dsh-pet-chat-command-usage{flex:none;font-family:monospace;font-size:12px}',
  '.dsh-pet-chat-command-description{margin-left:auto;font-size:11px;opacity:.72;white-space:nowrap}',
  '.dsh-pet-chat-resize{position:absolute;z-index:2;touch-action:none}',
  '.dsh-pet-chat-resize-e{right:0;top:0;bottom:0;width:8px;cursor:ew-resize}',
  '.dsh-pet-chat-resize-s{left:0;right:0;bottom:0;height:8px;cursor:ns-resize}',
  '.dsh-pet-chat-resize-se{right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize}',
  '.dsh-pet-chat-resize:focus-visible{outline:2px solid currentColor;outline-offset:-2px}',
  '.dsh-pet-chat[data-surface="desktop"]{background:rgba(77,107,254,.97);',
  'border-color:rgba(255,255,255,.28);color:#fff}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-input{color:#fff}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-input::placeholder{color:rgba(255,255,255,.65)}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-btn{color:rgba(255,255,255,.78)}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-btn:hover{background:rgba(255,255,255,.14);color:#fff}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-attach-x{color:rgba(255,255,255,.72)}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-attach-x:hover{background:rgba(255,255,255,.14);color:#fff}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-hint{color:rgba(255,255,255,.72)}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-err{color:#ffe1de}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-session:hover:not(:disabled),',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-session:focus-visible{background:rgba(255,255,255,.14)}',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-command[data-selected="1"],',
  '.dsh-pet-chat[data-surface="desktop"] .dsh-pet-chat-command:hover{background:rgba(255,255,255,.14)}',
].join('');

/** 输入框宽度自适应参数：初始小宽，随文本增宽，封顶后折行增高。 */
export const CHAT_MIN_W = 160;
export const CHAT_MAX_W = 340;
/** 输入框水平 padding 补偿（11×2） */
export const CHAT_H_PAD = 22;
/** 桌面问答区高度上限；一轮内容更高时在区内滚动。 */
export const CHAT_TRANSCRIPT_MAX_H = 240;

let chatCssInjected = false;

/** 把弹窗样式注入文档一次；重复挂载不会重复插入。 */
export function injectChatCss(): void {
  if (chatCssInjected || typeof document === 'undefined') return;
  chatCssInjected = true;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-pet';
  tag.dataset.pluginCss = 'dsh-pet/chat';
  tag.textContent = CHAT_CSS;
  document.head.appendChild(tag);
}
