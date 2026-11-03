import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 从按版本倒序排列的标签中取首个 v/V X.X.X 版本；没有有效标签时回退。 */
export function versionFromTags(tags, fallback) {
  for (const tag of tags) {
    const matched = /^[vV](\d+\.\d+\.\d+)$/.exec(tag.trim());
    if (matched) return matched[1];
  }
  return fallback;
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
