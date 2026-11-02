/**
 * 桌面 helper「置顶看门狗」的判定 + 窗口行为。
 *
 * 背景：Windows 双屏 + DSH 主窗最大化时，桌宠整只沉到主窗下面——进程活着、渲染正常，只是看不见；z 序上普通窗压在桌宠窗之上，而桌宠窗的 `WS_EX_TOPMOST` 位仍为真。
 *
 * 根因形状：`WS_EX_TOPMOST` 只是样式位，不等于窗口在置顶带里。该位必须靠
 * `SetWindowPos(HWND_TOPMOST/HWND_NOTOPMOST)` 才真正落带，直接写 `GWL_EXSTYLE` 只写位不落带；
 * 而 Electron 在 Windows 上翻转点击穿透走的就是 `SetWindowLong(GWL_EXSTYLE)` 读-改-写，
 * 于是「位在、带不在」既可能出现、又查不出来。建窗时那次 `setAlwaysOnTop` 之后再无复查，
 * 一次外部 z 序扰动就能让桌宠永久隐身，直到 helper 重启。
 *
 * 本文件钉三件事：① 判定规则：到点才重钉；隐藏/销毁/自检挂起期间不钉（下一拍补上）；
 * ② 常量不变式：节拍必须快于重钉间隔，否则退化成"每拍都钉"；③ 窗口按 display 决定是否
 * 初始置顶与启动看门狗，看门狗到点重钉并在关窗时停止。
 *
 * 用 Node 内置 test runner（node:test），不引入任何 npm 依赖。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const helper = '../../runtime/electron-helper/';
const {
  TOPMOST_WATCHDOG_TICK_MS,
  TOPMOST_REASSERT_MS,
  TOPMOST_WATCHDOG_ENABLED,
  shouldReassertTopmost,
  topmostLevel,
} = require(helper + 'topmost-watchdog.js');
const { createWindows } = require(helper + 'main/windows.js');

/** 一份"窗口健在、可见、没被挂起"的基准状态 */
const alive = { destroyed: false, visible: true, paused: false };

test('macOS 为截图浮层让位，其它平台保持原有置顶层级', () => {
  assert.equal(topmostLevel('darwin'), 'floating');
  assert.equal(topmostLevel('win32'), 'screen-saver');
  assert.equal(topmostLevel('linux'), 'screen-saver');
});

describe('shouldReassertTopmost —— 到点才重钉，每拍都问一次', () => {
  test('未到点不钉，到点钉', () => {
    assert.equal(
      shouldReassertTopmost({ ...alive, nowMs: 1000, lastAssertMs: 1000 }),
      false,
      '刚钉过不能立刻再钉（否则每拍一次 SetWindowPos）',
    );
    assert.equal(
      shouldReassertTopmost({ ...alive, nowMs: 1000 + TOPMOST_REASSERT_MS - 1, lastAssertMs: 1000 }),
      false,
      '差 1ms 不钉',
    );
    assert.equal(
      shouldReassertTopmost({ ...alive, nowMs: 1000 + TOPMOST_REASSERT_MS, lastAssertMs: 1000 }),
      true,
      '到点必须钉',
    );
  });

  test('隐藏 / 销毁 / 自检挂起期间一律不钉，哪怕早就到点', () => {
    const due = { nowMs: 1000 + TOPMOST_REASSERT_MS * 10, lastAssertMs: 1000 };
    assert.equal(shouldReassertTopmost({ ...due, ...alive, visible: false }), false, '未 show 的窗口钉了没意义');
    assert.equal(shouldReassertTopmost({ ...due, ...alive, destroyed: true }), false, '窗口已销毁不能再碰');
    assert.equal(
      shouldReassertTopmost({ ...due, ...alive, paused: true }),
      false,
      '冒烟自检挂起期间不得插一脚（与兜底轮询同一开关）',
    );
    assert.equal(shouldReassertTopmost({ ...due, visible: true }), true, '同样到点但没被拦时照钉');
  });

  test('时间戳异常（时钟回拨 / 缺参数）按到点处理；连 visible 都没声明则不钉', () => {
    assert.equal(
      shouldReassertTopmost({ ...alive, nowMs: 1000, lastAssertMs: 10_000 }),
      true,
      '时钟被回拨不能让看门狗永远哑火',
    );
    assert.equal(shouldReassertTopmost({ ...alive, nowMs: Number.NaN, lastAssertMs: 1000 }), true);
    assert.equal(shouldReassertTopmost({ destroyed: false, paused: false }), false, '没声明 visible 就不能钉');
    assert.equal(shouldReassertTopmost(undefined), false, '缺状态按不钉处理');
  });

  test('常量不变式：节拍必须快于重钉间隔', () => {
    assert.ok(TOPMOST_WATCHDOG_TICK_MS > 0, '节拍必须是正数');
    assert.ok(TOPMOST_WATCHDOG_TICK_MS < TOPMOST_REASSERT_MS, '节拍 >= 重钉间隔时判定退化成每拍都钉，纯函数也就白写了');
  });

  test('总开关关闭时，哪怕早就到点也一次都不钉', () => {
    const longDue = { ...alive, nowMs: 1000 + TOPMOST_REASSERT_MS * 10, lastAssertMs: 1000 };
    assert.equal(
      shouldReassertTopmost(longDue, false),
      false,
      '总开关是全看门狗唯一的停用入口，关掉后不得再调 SetWindowPos',
    );
    assert.equal(shouldReassertTopmost(longDue, true), true, '显式开启时照常判定（到点就钉）');
    assert.equal(
      typeof TOPMOST_WATCHDOG_ENABLED,
      'boolean',
      '总开关必须是布尔值（不能是 undefined/字符串，否则早退判断会放行）',
    );
  });
});

interface WindowRecord {
  options: Record<string, unknown>;
  alwaysOnTopCalls: Array<{ flag: boolean; level?: string }>;
  ignoreMouseEventsCalls: Array<{ ignore: boolean; options: { forward: boolean } }>;
}

interface TimerRecord {
  callback: () => void;
  ms: number;
  cleared: boolean;
}

/** 用窗口与定时器替身运行真实窗口装配，避免把接线契约写成源码文本守卫。 */
function createWindowHarness(display?: string) {
  const originalPets = process.env.DSH_PET_PETS;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalNow = Date.now;
  const records: WindowRecord[] = [];
  const timers: TimerRecord[] = [];
  const listeners = new Map<string, Array<() => void>>();
  let nowMs = 1000;
  let destroyed = false;
  const record: WindowRecord = { options: {}, alwaysOnTopCalls: [], ignoreMouseEventsCalls: [] };
  const win = {
    id: 1,
    setAlwaysOnTop: (flag: boolean, level?: string) => record.alwaysOnTopCalls.push({ flag, level }),
    setVisibleOnAllWorkspaces: () => {},
    setIgnoreMouseEvents: (ignore: boolean, options: { forward: boolean }) =>
      record.ignoreMouseEventsCalls.push({ ignore, options }),
    on: (event: string, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    once: () => {},
    isDestroyed: () => destroyed,
    isVisible: () => true,
    getBounds: () => ({ x: 0, y: 0, width: 924, height: 700 }),
    loadFile: async () => {},
    destroy: () => {
      destroyed = true;
      for (const listener of listeners.get('closed') ?? []) listener();
    },
    webContents: { setBackgroundThrottling: () => {}, on: () => {}, once: () => {}, send: () => {} },
  };
  function BrowserWindow(options: Record<string, unknown>) {
    record.options = options;
    records.push(record);
    return win;
  }
  globalThis.setInterval = ((callback: () => void, ms: number) => {
    const timer = { callback, ms, cleared: false };
    timers.push(timer);
    return timer;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = ((timer: TimerRecord) => {
    timer.cleared = true;
  }) as unknown as typeof clearInterval;
  Date.now = () => nowMs;
  process.env.DSH_PET_PETS = JSON.stringify([{ id: 'main', size: 462, ...(display === undefined ? {} : { display }) }]);
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const windows = createWindows({
    BrowserWindow,
    screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ id: 1 }) },
    buildDeskGeometry: () => ({
      hull: { ...area, height: 1080 },
      areas: [area],
      workAreas: [area],
      topInsetRatio: 0,
      panels: [],
      primaryIndex: 0,
    }),
    dpi: { petScale: () => 1, currentPointer: () => ({ x: 0, y: 0 }) },
    helperDir: '/tmp/dsh-pet-test',
    isBridge: false,
    openTarget: 'web',
    platform: process.platform,
    shouldReassertTopmost,
    topmostLevel,
    taskbarWatchdogEnabled: false,
  });
  return {
    records,
    timers,
    windows,
    advance: (ms: number) => {
      nowMs += ms;
    },
    restore: () => {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
      Date.now = originalNow;
      if (originalPets === undefined) delete process.env.DSH_PET_PETS;
      else process.env.DSH_PET_PETS = originalPets;
    },
  };
}

describe('createWindows —— 按 display 决定是否置顶', () => {
  test('display=desktop：建窗不置顶、不启动置顶看门狗，其它窗口行为不变', () => {
    const harness = createWindowHarness('desktop');
    try {
      harness.windows.create();
      const record = harness.records[0];
      assert.ok(record, '必须建出一个窗口');
      assert.equal(record.options.alwaysOnTop, false);
      assert.equal(record.options.transparent, true);
      assert.equal(record.options.skipTaskbar, true);
      assert.equal(record.options.focusable, true);
      assert.deepEqual(record.alwaysOnTopCalls, []);
      assert.deepEqual(record.ignoreMouseEventsCalls, [{ ignore: true, options: { forward: true } }]);
      assert.equal(
        harness.timers.some((timer) => timer.ms === TOPMOST_WATCHDOG_TICK_MS),
        false,
        '仅桌面窗口不得启动置顶看门狗',
      );
      harness.windows.closeAll();
      assert.ok(
        harness.timers.every((timer) => timer.cleared),
        '关闭窗口必须安全清理已启动的泵',
      );
    } finally {
      harness.windows.closeAll();
      harness.restore();
    }
  });

  test('display=both：保持初始置顶，总开关关闭时不重钉并在关窗时清理', () => {
    const harness = createWindowHarness('both');
    try {
      harness.windows.create();
      const record = harness.records[0];
      assert.ok(record, '必须建出一个窗口');
      assert.equal(record.options.alwaysOnTop, true);
      assert.deepEqual(record.alwaysOnTopCalls, [{ flag: true, level: topmostLevel(process.platform) }]);
      const watchdog = harness.timers.find((timer) => timer.ms === TOPMOST_WATCHDOG_TICK_MS);
      assert.ok(watchdog, '双端窗口必须启动置顶看门狗');
      harness.advance(TOPMOST_REASSERT_MS);
      watchdog.callback();
      assert.deepEqual(
        record.alwaysOnTopCalls,
        [{ flag: true, level: topmostLevel(process.platform) }],
        '生产总开关关闭时，看门狗到点也不得重钉',
      );
      harness.windows.closeAll();
      assert.equal(watchdog.cleared, true);
    } finally {
      harness.windows.closeAll();
      harness.restore();
    }
  });

  test('display 缺字段：兼容旧启动参数，仍按双端窗口置顶', () => {
    const harness = createWindowHarness();
    try {
      harness.windows.create();
      const record = harness.records[0];
      assert.ok(record, '必须建出一个窗口');
      assert.equal(record.options.alwaysOnTop, true);
      assert.deepEqual(record.alwaysOnTopCalls, [{ flag: true, level: topmostLevel(process.platform) }]);
      assert.ok(harness.timers.some((timer) => timer.ms === TOPMOST_WATCHDOG_TICK_MS));
    } finally {
      harness.windows.closeAll();
      harness.restore();
    }
  });
});
