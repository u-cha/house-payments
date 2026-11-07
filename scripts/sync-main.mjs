#!/usr/bin/env node
/**
 * sync-main.mjs — подлить свежий `origin/main` в текущую ветку перед пушем.
 *
 * Правило и границы — AGENTS.md §3.8 и ADR-0017. Скрипт делает ровно три вещи:
 *   1. `git fetch origin main`;
 *   2. если `origin/main` уже предок HEAD — ничего не меняет;
 *   3. иначе `git merge origin/main` — обычный merge, без rebase и без
 *      force-push (ветка уже может быть запушена).
 *
 * Конфликты скрипт НЕ разрешает и сторону НЕ выбирает: он печатает список
 * конфликтных файлов и выходит с кодом 1. Дальше — по AGENTS.md §3.8: понятный
 * конфликт разрешить вручную, смысловой или непонятный — вынести пользователю.
 *
 * Usage: pnpm sync:main  (или node scripts/sync-main.mjs)
 *
 * Коды выхода:
 *   0 — ветка содержит свежий origin/main (слияние выполнено или не требовалось);
 *   1 — конфликт слияния или незавершённый merge: нужно решение человека;
 *   2 — не git-репозиторий / detached HEAD / main / локальные изменения мешают;
 *   3 — не удалось получить origin/main (сеть, remote).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REMOTE = 'origin';
const DEFAULT_BRANCH = 'main';

export const EXIT_OK = 0;
export const EXIT_CONFLICT = 1;
export const EXIT_USAGE = 2;
export const EXIT_FETCH = 3;

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function indent(text) {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => `    ${line}`)
    .join('\n');
}

/**
 * Выполняет синхронизацию и возвращает код выхода.
 * Параметры нужны тестам и вызовам из других скриптов.
 */
export function syncMain({
  cwd = process.cwd(),
  remote = DEFAULT_REMOTE,
  branch = DEFAULT_BRANCH,
  log = console.log,
  error = console.error,
} = {}) {
  const inside = git(['rev-parse', '--is-inside-work-tree'], cwd);
  if (inside.status !== 0 || inside.stdout !== 'true') {
    error(`✗ ${cwd} — не git-репозиторий: подливать main не во что.`);
    return EXIT_USAGE;
  }

  const head = git(['symbolic-ref', '-q', 'HEAD'], cwd);
  if (head.status !== 0) {
    error('✗ detached HEAD: переключись на ветку задачи (AGENTS.md §3.2).');
    return EXIT_USAGE;
  }
  const currentBranch = head.stdout.replace(/^refs\/heads\//, '');
  if (currentBranch === branch) {
    error(`✗ текущая ветка — ${branch}: работа идёт в ветке задачи, а не в main (AGENTS.md §3.1).`);
    return EXIT_USAGE;
  }

  const mergeHead = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], cwd);
  if (mergeHead.status === 0 && mergeHead.stdout) {
    error('✗ уже идёт незавершённый merge: сначала заверши его (git commit) или отмени (git merge --abort).');
    return EXIT_CONFLICT;
  }

  const fetched = git(['fetch', '--quiet', remote, branch], cwd);
  if (fetched.status !== 0) {
    error(`✗ git fetch ${remote} ${branch} не удался — проверь сеть и remote:\n${indent(fetched.stderr)}`);
    return EXIT_FETCH;
  }

  const remoteRef = `refs/remotes/${remote}/${branch}`;
  const alreadyFresh = git(['merge-base', '--is-ancestor', remoteRef, 'HEAD'], cwd);
  if (alreadyFresh.status === 0) {
    log(`✓ ${currentBranch} уже содержит свежий ${remote}/${branch}: слияние не требуется.`);
    return EXIT_OK;
  }

  log(`→ подливаю ${remote}/${branch} в ${currentBranch}…`);
  const merge = git(
    ['merge', '--no-edit', '-m', `chore: sync with ${remote}/${branch}`, remoteRef],
    cwd,
  );
  if (merge.status === 0) {
    log(merge.stdout || `✓ ${remote}/${branch} слит в ${currentBranch}.`);
    log('✓ Дальше: pnpm check, затем git push.');
    return EXIT_OK;
  }

  const inMerge = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], cwd);
  const conflicted = git(['diff', '--name-only', '--diff-filter=U'], cwd);
  if (inMerge.status === 0 || conflicted.stdout) {
    error('✗ Конфликт слияния — пуш остановлен. Скрипт сторону не выбирает.');
    if (conflicted.stdout) {
      error(`  конфликтные файлы:\n${indent(conflicted.stdout)}`);
    }
    error('  Разреши вручную, затем: git add <файлы> && git commit --no-edit && pnpm check.');
    error('  Если непонятно, чья версия верна, — остановись и спроси пользователя (AGENTS.md §3.8).');
    error('  Отменить слияние: git merge --abort.');
    return EXIT_CONFLICT;
  }

  error(`✗ git merge ${remote}/${branch} не удался:\n${indent(merge.stderr || merge.stdout)}`);
  return EXIT_USAGE;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exit(syncMain());
}
