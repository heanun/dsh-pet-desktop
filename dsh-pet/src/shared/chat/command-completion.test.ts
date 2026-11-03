import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createChatCommandMenu } from './command-completion.ts';

type Listener = (event: never) => void;

class FakeElement {
  value = '';
  className = '';
  tabIndex = 0;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<Listener>>();
  children: FakeElement[] = [];

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [...children];
  }

  focus(): void {}

  emit(type: string, event: Record<string, unknown> = {}): void {
    const completed = {
      preventDefault() {},
      stopImmediatePropagation() {},
      ...event,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(completed as never);
  }
}

const originalDocument = globalThis.document;

beforeEach(() => {
  globalThis.document = { createElement: () => new FakeElement() } as unknown as Document;
});

afterEach(() => {
  globalThis.document = originalDocument;
});

function makeMenu() {
  const input = new FakeElement();
  let changeCount = 0;
  const menu = createChatCommandMenu({
    input: input as unknown as HTMLTextAreaElement,
    onChange: () => {
      changeCount += 1;
    },
  });
  return { input, menu, changeCount: () => changeCount };
}

describe('斜杠命令补全菜单', () => {
  test('方向键和 Enter → 选中 resume 并只补全不发送', () => {
    const { input, menu, changeCount } = makeMenu();
    input.value = '/';
    input.emit('input');
    assert.equal(menu.el.children.length, 3);
    assert.equal(input.attributes.get('aria-expanded'), 'true');

    input.emit('keydown', { key: 'ArrowDown' });
    input.emit('keydown', { key: 'Enter' });
    assert.equal(input.value, '/resume ');
    assert.equal(menu.isOpen(), false);
    assert.equal(changeCount(), 1);
    assert.equal(input.attributes.get('aria-expanded'), 'false');
    menu.dispose();
  });

  test('Tab 和鼠标点击 → 分别补全 compact 与 new', () => {
    const { input, menu } = makeMenu();
    input.value = '/c';
    input.emit('input');
    input.emit('keydown', { key: 'Tab' });
    assert.equal(input.value, '/compact');

    input.value = '/n';
    input.emit('input');
    (menu.el.children[0] as unknown as FakeElement).emit('click');
    assert.equal(input.value, '/new');
    assert.equal(menu.isOpen(), false);
    menu.dispose();
  });

  test('Esc 和 dispose → 收起菜单并解绑输入监听', () => {
    const { input, menu } = makeMenu();
    input.value = '/';
    input.emit('input');
    input.emit('keydown', { key: 'Escape' });
    assert.equal(menu.isOpen(), false);
    menu.dispose();
    assert.equal(input.listeners.get('input')?.size ?? 0, 0);
    assert.equal(input.listeners.get('keydown')?.size ?? 0, 0);
  });
});
