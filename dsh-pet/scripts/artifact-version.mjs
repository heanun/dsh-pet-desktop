import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 从任意顺序的标签中取最高 v/V X.X.X 版本；没有有效标签时回退。 */
export function versionFromTags(tags, fallback) {
  const candidates = [];
  for (const tag of tags) {
    const matched = /^[vV](\d+\.\d+\.\d+)$/.exec(tag.trim());
    if (matched) candidates.push({ version: matched[1], parts: matched[1].split('.').map(Number) });
  }
  candidates.sort((left, right) => {
    for (let index = 0; index < 3; index += 1) {
      if (left.parts[index] !== right.parts[index]) return right.parts[index] - left.parts[index];
    }
    return 0;
  });
  return candidates[0]?.version ?? fallback;
}

/** 读取仓库最高版本标签；无 Git 仓库或标签不可读时使用包清单版本。 */
export function resolveArtifactVersion(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  try {
    const output = execFileSync('git', ['tag', '--list', '--sort=-v:refname'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return versionFromTags(output.split(/\r?\n/), manifest.version);
  } catch {
    return manifest.version;
  }
}
