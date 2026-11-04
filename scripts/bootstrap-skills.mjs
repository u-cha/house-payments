#!/usr/bin/env node
/**
 * bootstrap-skills.mjs — restore the vendored agent skills after a fresh clone.
 *
 * `third_party/` is deliberately not committed: it holds partial git clones of
 * third-party skill repositories. The source of truth is skills.lock.json
 * (repository, sparse paths, commit). This script:
 *
 *   1. clones missing repositories (blobless + sparse) or updates existing ones;
 *   2. checks out exactly the pinned commit (detached HEAD);
 *   3. applies the locked sparse paths;
 *   4. creates `.dsh/skills/<name>` -> `../../third_party/<dir>/<path>` symlinks;
 *   5. включает локальный `pre-push`-хук из `.githooks/` (AGENTS.md §3.8, ADR-0017).
 *
 * Idempotent: running it again converges to the locked state and never deletes
 * local changes silently — an existing clone with a dirty tree is left alone
 * with a warning.
 *
 * Usage: `pnpm bootstrap` (or `node scripts/bootstrap-skills.mjs`).
 * Windows note: creating symlinks needs Developer Mode or an elevated shell;
 * development happens on macOS, CI does not need these skills.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'skills.lock.json');
const skillsDir = join(root, '.dsh/skills');

function run(args, cwd = root) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function isGitRepo(dir) {
  return existsSync(join(dir, '.git'));
}

function hasLocalChanges(dir) {
  return run(['status', '--porcelain'], dir).length > 0;
}

function ensureRepo(spec) {
  const dir = join(root, spec.dir);
  const pinned = spec.commit;
  const cloneArgs = spec.cloneArgs ?? ['--filter=blob:none', '--sparse'];

  if (!isGitRepo(dir)) {
    console.log(`clone  ${spec.dir} @ ${pinned.slice(0, 8)}`);
    execFileSync('git', ['clone', ...cloneArgs, spec.url, dir], { cwd: root, stdio: 'inherit' });
  } else if (hasLocalChanges(dir)) {
    console.warn(`skip   ${spec.dir}: local changes present, not touching it`);
    return false;
  } else {
    console.log(`fetch  ${spec.dir}`);
    run(['fetch', '--filter=blob:none', '--quiet', 'origin'], dir);
  }

  run(['sparse-checkout', 'set', ...spec.sparsePaths], dir);
  run(['checkout', '--quiet', '--detach', pinned], dir);

  const actual = run(['rev-parse', 'HEAD'], dir);
  if (actual !== pinned) {
    throw new Error(`${spec.dir}: expected ${pinned}, got ${actual}`);
  }
  return true;
}

function ensureSymlink(name, relTarget) {
  const linkPath = join(skillsDir, name);
  mkdirSync(skillsDir, { recursive: true });

  if (existsSync(linkPath) || lstatExists(linkPath)) {
    if (!lstatSync(linkPath).isSymbolicLink()) {
      console.warn(`skip   .dsh/skills/${name}: exists and is not a symlink`);
      return;
    }
    if (readlinkSync(linkPath) === relTarget) return;
    unlinkSync(linkPath);
  }
  symlinkSync(relTarget, linkPath);
  console.log(`link   .dsh/skills/${name} -> ${relTarget}`);
}

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Включает локальный pre-push-хук: `core.hooksPath = .githooks`.
 * Хук не пускает пуш ветки без свежего `origin/main` (AGENTS.md §3.8, ADR-0017).
 * Чужой `core.hooksPath` не перезаписывается — только предупреждение.
 */
function ensureHooksPath() {
  if (!existsSync(join(root, '.githooks/pre-push')) || !isGitRepo(root)) return;
  let current = '';
  try {
    current = run(['config', '--get', 'core.hooksPath']);
  } catch {
    current = '';
  }
  if (current === '.githooks') return;
  if (current) {
    console.warn(`skip   core.hooksPath: уже задан «${current}», не перезаписываю`);
    return;
  }
  run(['config', 'core.hooksPath', '.githooks']);
  console.log('hooks  core.hooksPath = .githooks (pre-push: свежий origin/main)');
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
let failures = 0;

for (const spec of lock.repos) {
  try {
    const ready = ensureRepo(spec);
    if (!ready) continue;
    for (const [name, skillPath] of Object.entries(spec.skills)) {
      ensureSymlink(name, `../../${spec.dir}/${skillPath}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`error  ${spec.dir}: ${error.message}`);
  }
}

try {
  ensureHooksPath();
} catch (error) {
  failures += 1;
  console.error(`error  core.hooksPath: ${error.message}`);
}

if (failures > 0) {
  console.error(`\nbootstrap finished with ${failures} failed repositories`);
  process.exit(1);
}

console.log('\nbootstrap ok: skill clones are at the pinned commits and symlinks are in place');
