// Run after npm run build: DSH_PET_ELECTRON=/path/to/Electron npm run test:ui
// Uses an isolated mock host: no DSH credentials, conversations or user config are read/written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import { runInNewContext } from 'node:vm';
import { _electron } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const executablePath = process.env.DSH_PET_ELECTRON;

function makeDesktopSprite(scale = 2) {
  const area = { x: 600, y: 300, width: 200, height: 300 };
  const boundsCalls = [];
  const context = {
    BASE: 'http://127.0.0.1/dsh-pet',
    console,
    navigator: { platform: 'Linux', userAgent: 'Linux' },
    S: {
      resolveRect: (areas, x, y) =>
        areas.find((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height),
    },
    VIEW: { x: 0, y: 0, w: 800, h: 600 },
    WORK_AREAS: [area],
    toScreen: (value) => value * scale,
    window: {
      __dshPetDebug: {},
      petBridge: { setBounds: (...args) => boundsCalls.push(args) },
    },
  };
  runInNewContext(
    readFileSync(join(root, 'runtime/electron-helper/sprite.js'), 'utf8') + '\n;globalThis.TestPetSprite = PetSprite;',
    context,
  );
  runInNewContext(readFileSync(join(root, 'runtime/electron-helper/sprite/menu.js'), 'utf8'), context);
  const sprite = Object.create(context.TestPetSprite.prototype);
  Object.assign(sprite, {
    size: 100,
    halfW: 50,
    halfH: 35,
    winH: 70,
    bottomPad: 20,
    pos: { x: 700, y: 500 },
    margin: { t: 50, r: 20, b: 20, l: 20 },
    chatBaseMargin: null,
    el: { style: {}, remove() {} },
    hit: { getBoundingClientRect: () => ({ right: 120, top: 80 }) },
    pet: { id: 'main' },
    throwState: null,
    tipOn: false,
    markPoseDirty() {},
    syncInputBusy() {},
    setInteractive(value) {
      this.interactive = value;
    },
    ac: { abort() {} },
    inputRegionMutation: { disconnect() {} },
    inputRegionResize: { disconnect() {} },
    inputRegionElements: new Set(),
    bubbleTimer: null,
    whisperTimer: null,
    workTimer: null,
    closeMenu() {},
    stopThrow() {},
    stopDragFollow() {},
    stopSquash() {},
    stopMove() {},
  });
  return { sprite, context, boundsCalls, scale };
}

test('聊天窗口扩展：右下工作区边缘与小宠物 → 视觉位置不变且 clamp 覆盖扩展窗口', () => {
  const { sprite, boundsCalls, scale } = makeDesktopSprite();
  sprite.expandChatWindow();

  assert.deepEqual({ ...sprite.margin }, { t: 200, r: 20, b: 30, l: 100 });
  assert.equal(sprite.el.style.left, '100px');
  assert.equal(sprite.el.style.top, '200px');
  assert.deepEqual({ ...sprite.visibleClampRect() }, { x: 0, y: 0, w: 200, h: 300 });
  const expanded = boundsCalls.at(-1);
  assert.deepEqual(expanded.slice(0, 4), [1200, 600, 440, 600]);
  assert.equal(expanded[0] + scale * Number.parseFloat(sprite.el.style.left), scale * sprite.pos.x);
  assert.equal(expanded[1] + scale * Number.parseFloat(sprite.el.style.top), scale * sprite.pos.y);
  assert.deepEqual(expanded.slice(10), [200, 400]);

  sprite.restoreChatWindow();
  assert.deepEqual({ ...sprite.margin }, { t: 50, r: 20, b: 20, l: 20 });
  assert.equal(sprite.el.style.left, '20px');
  assert.equal(sprite.el.style.top, '50px');
  assert.deepEqual(boundsCalls.at(-1).slice(0, 4), [1360, 900, 280, 280]);
});

test('聊天关闭与销毁：恢复进入前 margin、bounds 和点击穿透', () => {
  const { sprite, context } = makeDesktopSprite();
  let dialogOptions;
  context.S.setVoiceBase = () => {};
  context.S.mountChatDialog = (options) => {
    dialogOptions = options;
    return { close: () => options.onClose() };
  };
  const originalMargin = { ...sprite.margin };

  sprite.showChatFromMenu();
  assert.deepEqual({ ...dialogOptions.clamp }, { x: 0, y: 0, w: 200, h: 300 });
  assert.equal(sprite.chatOpen, true);
  assert.equal(sprite.interactive, true);
  sprite.chatMount.close();
  assert.deepEqual({ ...sprite.margin }, originalMargin);
  assert.equal(sprite.chatOpen, false);
  assert.equal(sprite.interactive, false);

  sprite.showChatFromMenu();
  sprite.dispose();
  assert.deepEqual({ ...sprite.margin }, originalMargin);
  assert.equal(sprite.chatMount, null);
  assert.equal(sprite.chatOpen, false);
  assert.equal(sprite.interactive, false);
});

test(
  'macOS desktop: native geometry, HiDPI menu and click-through recovery',
  {
    skip: process.platform !== 'darwin' || !executablePath,
    timeout: 30000,
  },
  async (t) => {
    const source = readFileSync(join(root, 'assets/config.jsonc'), 'utf8');
    const config = JSON.parse(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\\:])\/\/.*$/gm, '$1'));
    config.pets = [
      {
        ...config.pets[0],
        size: 150,
        fixedEnabled: true,
        balanceEnabled: false,
        whisperEnabled: false,
        workStatusEnabled: false,
        display: 'desktop',
        position: { corner: 'top-left', marginX: 200, marginY: 0 },
      },
    ];
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path.endsWith('/config')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ main: config }));
      } else if (path.includes('/thumb/')) {
        const file = join(root, 'assets/webm', basename(path));
        if (!existsSync(file)) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.setHeader('content-type', 'video/webm');
        createReadStream(file).pipe(res);
      } else {
        res.setHeader('content-type', 'application/json');
        res.end('{}');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    let app;
    try {
      const env = {
        ...process.env,
        DSH_PET_BRIDGE: '0',
        DSH_PET_SMOKE: '0',
        DSH_PET_CONFIG_URL: `http://127.0.0.1:${server.address().port}/dsh-pet-7340/config`,
        DSH_PET_PETS: JSON.stringify([{ id: 'main', size: 150 }]),
        DSH_PET_SCALE: '1',
      };
      delete env.ELECTRON_RUN_AS_NODE;
      app = await _electron.launch({ executablePath, args: [join(root, 'runtime/electron-helper/main.js')], env });
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.__dshPetDebug?.configOk);
      await page.waitForFunction(() => document.visibilityState === 'visible');
      await app.evaluate(({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const original = win.setIgnoreMouseEvents.bind(win);
        win.testIgnoring = true;
        win.setIgnoreMouseEvents = (value, options) => {
          win.testIgnoring = value;
          original(value, options);
        };
        // Control the fallback cursor deterministically without moving the user's physical pointer.
        screen.getCursorScreenPoint = () => ({ x: -9999, y: -9999 });
      });

      await t.test('Retina uses native point coordinates, menu scale remains 1x, head reaches panel top', async () => {
        const actual = await app.evaluate(({ BrowserWindow, screen }) => ({
          bounds: BrowserWindow.getAllWindows()[0].getContentBounds(),
          zoom: BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
          focused: BrowserWindow.getAllWindows()[0].isFocused(),
          display: screen.getPrimaryDisplay().bounds,
          scale: screen.getPrimaryDisplay().scaleFactor,
        }));
        const hit = await page.locator('.pet-hit').boundingBox();
        t.diagnostic(JSON.stringify({ ...actual, hit }));
        assert.equal(actual.zoom, 1);
        assert.equal(actual.bounds.width, 300);
        assert.ok(Math.abs(actual.bounds.y + hit.y - actual.display.y) <= 1);
        assert.equal(actual.focused, false, 'starting the pet must not activate its window');
      });

      await t.test('throw ceiling and negative margin retain the physical top coordinate', async () => {
        const geometry = await page.evaluate(`(() => {
        const s = sprites[0];
        const head = s.hitRect.y;
        const ceiling = s.throwSpaceOf().bounds[0].minY + head + VIEW.y;
        s.pet.position.marginY = -20;
        s.position();
        const negative = s.pos.y + head + VIEW.y;
        s.pet.position.marginY = 0;
        s.position();
        return { ceiling, negative };
      })()`);
        assert.equal(geometry.ceiling, 0);
        assert.ok(Math.abs(geometry.negative + 20) <= 1);
      });

      await t.test('menu stays below the system menu bar and closes with immediate click-through', async () => {
        // Use a larger pet so the menu fits; unlike zoom, size must not enlarge menu typography.
        await page.evaluate(`(() => {
        config.pets[0].size = 462;
        config.pets[0].position.marginY = 100;
        sprites[0].dispose();
        sprites = [new PetSprite(config.pets[0])];
        const s = sprites[0], r = s.hit.getBoundingClientRect();
        s.onContextMenu(new MouseEvent('contextmenu', {clientX:r.x+r.width/2, clientY:r.y+r.height/2}));
      })()`);
        await page.waitForSelector('.dsh-pet-menu-column');
        const metrics = await page.evaluate(`(() => {
        const s = sprites[0], menu = document.querySelector('.dsh-pet-menu-column');
        const rect = menu.getBoundingClientRect();
        return { y: s.pos.y + VIEW.y - s.margin.t + rect.y,
          font: parseFloat(getComputedStyle(menu).fontSize) };
      })()`);
        const workTop = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea.y);
        assert.ok(metrics.y >= workTop);
        assert.ok(metrics.font <= 16, `menu font unexpectedly doubled: ${metrics.font}`);
        const menu = await page.locator('.dsh-pet-menu-column').first().boundingBox();
        const win = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
        await app.evaluate(
          ({ screen }, point) => {
            screen.getCursorScreenPoint = () => point;
          },
          {
            x: win.x + menu.x + 10,
            y: win.y + menu.y + 10,
          },
        );
        await assertEventually(async () =>
          app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].testIgnoring),
        );
        await app.evaluate(
          ({ screen }, point) => {
            screen.getCursorScreenPoint = () => point;
          },
          {
            x: win.x + 2,
            y: win.y + win.height - 2,
          },
        );
        await assertEventually(async () =>
          app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].testIgnoring),
        );
        assert.equal(
          await page.evaluate('sprites[0].menuOpen'),
          true,
          'transparent margin must pass through even while menu stays open',
        );
        await page.evaluate('sprites[0].closeMenu()');
        await page.waitForFunction(
          () => window.__dshPetDebug.inputBusy === false && window.__dshPetDebug.interactive === false,
        );
        await assertEventually(async () =>
          app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].testIgnoring),
        );
      });

      await t.test('chat input stays usable while its surrounding transparent area passes through', async () => {
        await page.evaluate('sprites[0].showChatFromMenu()');
        await page.waitForSelector('.dsh-pet-chat');
        const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
        const chat = await page.locator('.dsh-pet-chat').boundingBox();
        await app.evaluate(
          ({ screen }, p) => {
            screen.getCursorScreenPoint = () => p;
          },
          {
            x: bounds.x + chat.x + chat.width / 2,
            y: bounds.y + chat.y + chat.height / 2,
          },
        );
        await assertEventually(async () =>
          app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].testIgnoring),
        );
        await page
          .locator('.dsh-pet-chat-input')
          .fill('测试输入：长文本增长后仍然可以点击聊天框，旁边的应用保持可点击。'.repeat(4));
        const expanded = await page.locator('.dsh-pet-chat').boundingBox();
        assert.ok(expanded.height > chat.height);
        await app.evaluate(
          ({ screen }, p) => {
            screen.getCursorScreenPoint = () => p;
          },
          {
            x: bounds.x + expanded.x + expanded.width / 2,
            y: bounds.y + expanded.y + expanded.height - 5,
          },
        );
        await assertEventually(async () =>
          app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].testIgnoring),
        );
        await app.evaluate(
          ({ screen }, p) => {
            screen.getCursorScreenPoint = () => p;
          },
          {
            x: bounds.x + 2,
            y: bounds.y + bounds.height - 2,
          },
        );
        await assertEventually(async () =>
          app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].testIgnoring),
        );
        assert.equal(await page.evaluate('sprites[0].chatOpen'), true);
        await page.evaluate('sprites[0].chatClose()');
        assert.equal(await page.evaluate('sprites[0].inputBusy()'), false);
      });

      await t.test('missing pointerup and switching apps release stuck dragging/menu input', async () => {
        await page.evaluate(`(() => {
        const s = sprites[0];
        s.dragState.active = true;
        s.syncInputBusy();
        s.setInteractive(true);
        s.onMouseMove(new MouseEvent('mousemove', { buttons: 0, clientX: 0, clientY: 0 }));
      })()`);
        assert.equal(await page.evaluate('sprites[0].dragState.active'), false);
        await page.evaluate(`(() => {
        const s = sprites[0];
        s.menuOpen = true;
        s.syncInputBusy();
        s.setInteractive(true);
        window.dispatchEvent(new Event('blur'));
      })()`);
        assert.equal(await page.evaluate('sprites[0].inputBusy()'), false);
        await assertEventually(async () =>
          app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].testIgnoring),
        );
      });
    } finally {
      if (app) await app.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

async function assertEventually(check) {
  for (let i = 0; i < 20; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('native window did not restore click-through');
}
