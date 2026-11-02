import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { clampChatHeight, clampChatWidth, createChatResizeDriver } from './resize.ts';

type Listener = (event: never) => void;

class FakeTarget {
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Set<Listener>>();
  readonly captures = new Set<number>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Record<string, unknown>): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event as never);
  }

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.captures.delete(pointerId);
  }
}

const originalDocument = globalThis.document;
const originalComputedStyle = globalThis.getComputedStyle;

beforeEach(() => {
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 20 }) }),
    }),
  } as unknown as Document;
  globalThis.getComputedStyle = () => ({ font: '14px test' }) as CSSStyleDeclaration;
});

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.getComputedStyle = originalComputedStyle;
});

function pointerEvent(pointerId: number, clientX = 0, clientY = 0) {
  return { button: 0, pointerId, clientX, clientY, preventDefault() {}, stopPropagation() {} };
}

function makeDriver(maxWidth = 340, maxHeight = 500) {
  const root = new FakeTarget();
  const input = Object.assign(new FakeTarget(), { value: '', scrollHeight: 22 });
  const handles = { right: new FakeTarget(), bottom: new FakeTarget(), corner: new FakeTarget() };
  let layoutCount = 0;
  Object.defineProperty(root, 'getBoundingClientRect', {
    value: () => ({
      width: Number.parseFloat(root.style.width ?? '160'),
      height: Number.parseFloat(root.style.height ?? '72'),
    }),
  });
  const driver = createChatResizeDriver({
    root: root as unknown as HTMLElement,
    input: input as unknown as HTMLTextAreaElement,
    handles: {
      right: handles.right as unknown as HTMLElement,
      bottom: handles.bottom as unknown as HTMLElement,
      corner: handles.corner as unknown as HTMLElement,
    },
    maxWidth: () => maxWidth,
    maxHeight: () => maxHeight,
    onLayout: () => {
      layoutCount += 1;
    },
  });
  return { root, input, handles, driver, layoutCount: () => layoutCount };
}

describe('聊天框双向拉伸', () => {
  test('目标尺寸 → 最小值、最大值和向上取整同时生效', () => {
    assert.equal(clampChatWidth(20, 340), 160);
    assert.equal(clampChatWidth(200.1, 340), 201);
    assert.equal(clampChatWidth(500, 340), 340);
    assert.equal(clampChatWidth(500, 120), 160);
    assert.equal(clampChatHeight(20, 500), 96);
    assert.equal(clampChatHeight(120.1, 500), 121);
    assert.equal(clampChatHeight(600, 500), 500);
    assert.equal(clampChatHeight(600, 80), 96);
  });

  test('手动拖宽后继续输入 → 宽度保持不变且 textarea 高度仍自动调整', () => {
    const { root, input, handles, driver } = makeDriver();
    input.value = '1234567890';
    driver.resizeInput();
    assert.equal(root.style.width, '222px');

    handles.right.emit('pointerdown', pointerEvent(7, 10));
    handles.right.emit('pointermove', pointerEvent(7, 112));
    assert.equal(root.style.width, '324px');

    input.value = 'x';
    input.scrollHeight = 48;
    driver.resizeInput();
    assert.equal(root.style.width, '324px');
    assert.equal(input.style.height, '48px');
    driver.dispose();
  });

  test('下缘拖高后继续输入 → 根高度不被自动输入高度重置', () => {
    const { root, input, handles, driver } = makeDriver();
    handles.bottom.emit('pointerdown', pointerEvent(3, 0, 10));
    handles.bottom.emit('pointermove', pointerEvent(3, 100, 112));
    assert.equal(root.style.height, '174px');
    assert.equal(root.style.width, undefined);

    input.scrollHeight = 48;
    driver.resizeInput();
    assert.equal(root.style.height, '174px');
    assert.equal(input.style.height, '48px');
    handles.bottom.emit('pointercancel', { pointerId: 3 });
    assert.equal(handles.bottom.captures.size, 0);
    driver.dispose();
  });

  test('右下角快速拖动 → 同时调宽高且只捕获当前 handle', () => {
    const { root, handles, driver } = makeDriver(600, 600);
    root.style.width = '200px';
    root.style.height = '120px';
    handles.corner.emit('pointerdown', pointerEvent(9, 500, 400));
    handles.corner.emit('pointermove', pointerEvent(9, 900, 700));
    assert.equal(root.style.width, '600px');
    assert.equal(root.style.height, '420px');
    assert.deepEqual([...handles.corner.captures], [9]);
    assert.equal(handles.right.captures.size, 0);
    assert.equal(handles.bottom.captures.size, 0);

    handles.right.emit('pointermove', pointerEvent(9, 1000, 700));
    assert.equal(root.style.width, '600px');
    handles.corner.emit('pointerup', { pointerId: 9 });
    handles.corner.emit('pointermove', pointerEvent(9, 1000, 800));
    assert.equal(root.style.height, '420px');
    assert.equal(handles.corner.captures.size, 0);
    driver.dispose();
  });

  test('键盘方向键 → 单缘只调对应方向，右下角同时支持四个方向', () => {
    const { root, handles, driver, layoutCount } = makeDriver();
    handles.right.emit('keydown', { key: 'ArrowRight', preventDefault() {} });
    handles.right.emit('keydown', { key: 'ArrowDown', preventDefault() {} });
    assert.equal(root.style.width, '176px');
    assert.equal(root.style.height, undefined);

    handles.bottom.emit('keydown', { key: 'ArrowDown', preventDefault() {} });
    assert.equal(root.style.height, '96px');
    handles.corner.emit('keydown', { key: 'ArrowLeft', preventDefault() {} });
    handles.corner.emit('keydown', { key: 'ArrowUp', preventDefault() {} });
    assert.equal(root.style.width, '160px');
    assert.equal(root.style.height, '96px');
    assert.equal(layoutCount(), 4);
    driver.dispose();
  });

  test('丢失 pointer capture → 清理活动态并忽略后续移动', () => {
    const { root, handles, driver, layoutCount } = makeDriver();
    handles.right.emit('pointerdown', pointerEvent(2, 10));
    handles.right.emit('pointermove', pointerEvent(2, 40));
    handles.right.captures.clear();
    handles.right.emit('lostpointercapture', { pointerId: 2 });
    const count = layoutCount();
    handles.right.emit('pointermove', pointerEvent(2, 200));
    assert.equal(root.style.width, '190px');
    assert.equal(layoutCount(), count);
    driver.dispose();
  });

  test('活动中 dispose → 释放捕获并解绑全部输入与手柄监听', () => {
    const { input, handles, driver } = makeDriver();
    handles.corner.emit('pointerdown', pointerEvent(5, 10, 10));
    driver.dispose();
    assert.equal(handles.corner.captures.size, 0);
    assert.equal(input.listeners.get('input')?.size ?? 0, 0);
    for (const handle of Object.values(handles)) {
      for (const type of [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'lostpointercapture',
        'keydown',
      ]) {
        assert.equal(handle.listeners.get(type)?.size ?? 0, 0, `${type} 应该已解绑`);
      }
    }
    driver.dispose();
  });
});
