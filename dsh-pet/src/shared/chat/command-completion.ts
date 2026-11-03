/**
 * 斜杠命令补全菜单：拥有候选项、键盘选择与输入监听。
 * 只补全输入，不发送命令；弹窗关闭时由 DOM 装配层统一 dispose。
 * 输入监听器必须先于发送监听器注册，以便菜单打开时接管 Enter。
 */
import { listChatCommandCompletions, type ChatCommandCompletion } from './commands.ts';

/** 命令补全菜单的元素、状态与清理入口。 */
export interface ChatCommandMenu {
  readonly el: HTMLDivElement;
  readonly isOpen: () => boolean;
  readonly hide: () => void;
  readonly dispose: () => void;
}

/** 创建斜杠命令补全菜单。 */
export function createChatCommandMenu(opts: { input: HTMLTextAreaElement; onChange: () => void }): ChatCommandMenu {
  const { input, onChange } = opts;
  const el = document.createElement('div');
  el.className = 'dsh-pet-chat-commands';
  el.dataset.on = '0';
  el.setAttribute('role', 'listbox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');

  let open = false;
  let selectedIndex = 0;
  let completions: readonly ChatCommandCompletion[] = [];

  const hide = (): void => {
    open = false;
    el.dataset.on = '0';
    el.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
  };
  const choose = (index: number): void => {
    const completion = completions[index];
    if (!completion) return;
    input.value = '/' + completion.name + (completion.name === 'resume' ? ' ' : '');
    hide();
    onChange();
    input.focus();
  };
  const render = (): void => {
    el.replaceChildren();
    completions.forEach((completion, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dsh-pet-chat-command';
      button.dataset.selected = index === selectedIndex ? '1' : '0';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
      button.tabIndex = -1;
      const usage = document.createElement('span');
      usage.className = 'dsh-pet-chat-command-usage';
      usage.textContent = completion.usage;
      const description = document.createElement('span');
      description.className = 'dsh-pet-chat-command-description';
      description.textContent = completion.description;
      button.append(usage, description);
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => choose(index));
      el.appendChild(button);
    });
  };
  const update = (): void => {
    completions = listChatCommandCompletions(input.value);
    selectedIndex = 0;
    if (completions.length === 0) {
      hide();
      return;
    }
    open = true;
    el.dataset.on = '1';
    input.setAttribute('aria-expanded', 'true');
    render();
  };
  const onInput = (): void => update();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      selectedIndex = (selectedIndex + delta + completions.length) % completions.length;
      render();
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      event.stopImmediatePropagation();
      choose(selectedIndex);
    }
  };
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);

  return {
    el,
    isOpen: () => open,
    hide,
    dispose: () => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      hide();
    },
  };
}
