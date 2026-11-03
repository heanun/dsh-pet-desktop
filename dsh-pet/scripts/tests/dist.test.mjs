import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = fileURLToPath(new URL('../../', import.meta.url));
const { versionFromTags } = await import('../artifact-version.mjs');

test('标签版本 → 任意顺序和 v/V 前缀都取最高版本，无有效标签时回退', () => {
  assert.equal(versionFromTags(['v0.4.0', 'V1.0.0'], '0.4.0'), '1.0.0');
  assert.equal(versionFromTags(['V1.0.0', 'v1.0.10', 'v1.0.2'], '0.4.0'), '1.0.10');
  assert.equal(versionFromTags(['nightly', 'v1.0.0-beta.1'], '0.4.0'), '0.4.0');
  assert.equal(versionFromTags([], '0.4.0'), '0.4.0');
});

test('dist 默认调用 electron-builder --win portable，不执行真实构建', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-pet-dist-'));
  try {
    const script = join(sandbox, 'scripts/dist.mjs');
    const cliDir = join(sandbox, 'node_modules/electron-builder/out/cli');
    const argsFile = join(sandbox, 'args.json');
    mkdirSync(dirname(script), { recursive: true });
    mkdirSync(cliDir, { recursive: true });
    copyFileSync(join(root, 'scripts/dist.mjs'), script);
    copyFileSync(join(root, 'scripts/artifact-version.mjs'), join(sandbox, 'scripts/artifact-version.mjs'));
    writeFileSync(join(sandbox, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    writeFileSync(
      join(cliDir, 'cli.js'),
      "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.DSH_PET_TEST_ARGS, JSON.stringify(process.argv.slice(2)));\n",
    );

    const result = spawnSync(process.execPath, [script], {
      cwd: sandbox,
      env: {
        ...process.env,
        DSH_HOME: join(sandbox, 'empty-home'),
        DSH_PET_ALLOW_ELECTRON_DOWNLOAD: '1',
        DSH_PET_ELECTRON_DIST: '',
        DSH_PET_ELECTRON_PATH: '',
        DSH_PET_TEST_ARGS: argsFile,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(argsFile, 'utf8')), [
      '--win',
      'portable',
      '--config.extraMetadata.version=0.4.0',
    ]);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('dist 拒绝旧 dir target，并提示只支持 portable', () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/dist.mjs'), 'dir'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /只支持 portable/);
});

test('Windows portable 配置保留内部名称并固定单文件产物名', () => {
  const config = yaml.load(readFileSync(join(root, 'electron-builder.yml'), 'utf8'));
  assert.equal(config.productName, 'dsh-pet');
  assert.equal(config.appId, 'com.pc2005.dsh-pet');
  assert.deepEqual(config.win.target, ['portable']);
  assert.deepEqual(config.portable, {
    artifactName: 'dsh-pet-desktop-${version}.${ext}',
    requestExecutionLevel: 'user',
    unpackDirName: false,
  });
});
