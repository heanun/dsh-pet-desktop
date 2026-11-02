import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createChatTranscript } from './transcript.ts';

class FakeElement {
  readonly style: Record<string, string | number> = {};
  readonly dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  textContent = '';
  className = '';
  scrollHeight = 20;
  scrollTop = 0;

  get lastElementChild(): FakeElement | null {
    return this.children[this.children.length - 1] ?? null;
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = children;
  }
}

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.document = { createElement: () => new FakeElement() } as unknown as Document;
  globalThis.window = globalThis as unknown as Window & typeof globalThis;
});

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function transcript() {
  return createChatTranscript({ baseUrl: '/chat', petId: 'main', onLayout: () => {} });
}

describe('会话历史切换', () => {
  test('reload → 不过滤弹窗打开后的目标会话消息', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          messages: [
            { role: 'user', content: '新会话问题', ts: Date.now() + 10_000 },
            { role: 'assistant', content: '新会话回复', ts: Date.now() + 10_000 },
          ],
        }),
      )) as typeof fetch;
    const view = transcript();
    await view.reload();
    const el = view.el as unknown as FakeElement;
    assert.equal(el.children.length, 1);
    assert.equal(el.children[0]?.children[0]?.textContent, '> 新会话问题');
    view.dispose();
  });

  test('clear → 清空历史和尚未发送完成的本地轮', () => {
    const view = transcript();
    view.appendUser('本地问题');
    view.appendReply('本地回复');
    view.clear();
    const el = view.el as unknown as FakeElement;
    assert.equal(el.children.length, 0);
    assert.equal(el.dataset.empty, '1');
    view.dispose();
  });

  test('旧请求晚到 → 不覆盖 reload 已显示的会话', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const responses = [first.promise, second.promise];
    globalThis.fetch = (() => Promise.resolve(responses.shift())) as typeof fetch;
    const view = transcript();
    const initial = view.load();
    const reloaded = view.reload();
    second.resolve(new Response(JSON.stringify({ messages: [{ role: 'assistant', content: '新会话', ts: 2 }] })));
    await reloaded;
    first.resolve(new Response(JSON.stringify({ messages: [{ role: 'assistant', content: '旧会话', ts: 1 }] })));
    await initial;
    const el = view.el as unknown as FakeElement;
    assert.equal(el.children[0]?.children[0]?.textContent, '新会话');
    view.dispose();
  });
});
