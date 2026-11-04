/**
 * git-fixture.mjs — общая песочница для тестов git-механики (sync-main, pre-push).
 *
 * Создаёт временный bare-remote `origin.git` и клон `work` с веткой `main`,
 * чтобы тесты не трогали настоящий репозиторий и работали без сети.
 * Тестовые файлы подхватываются `node --test tests/*.test.mjs`; этот модуль
 * тестом не считается (нет суффикса `.test.mjs`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Запускает git и возвращает stdout (без завершающего перевода строки). */
export function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

/** Запускает git без исключения на ненулевом коде выхода. */
export function gitResult(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

/** Конфигурирует автора коммитов, чтобы git не спрашивал identity. */
export function configure(cwd, name) {
  git(cwd, ['config', 'user.name', name]);
  git(cwd, ['config', 'user.email', `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.test`]);
  git(cwd, ['config', 'commit.gpgsign', 'false']);
}

/** Создаёт временный remote и рабочий клон, запушенный `main`. */
export function createFixture() {
  const base = mkdtempSync(join(tmpdir(), 'house-payments-git-'));
  const origin = join(base, 'origin.git');
  const work = join(base, 'work');
  mkdirSync(origin);
  mkdirSync(work);

  git(base, ['init', '--bare', '--quiet', 'origin.git']);
  git(work, ['init', '--quiet']);
  configure(work, 'Work Agent');
  writeFileSync(join(work, 'README.md'), 'base\n');
  git(work, ['add', 'README.md']);
  git(work, ['commit', '--quiet', '-m', 'init']);
  git(work, ['branch', '-M', 'main']);
  git(work, ['remote', 'add', 'origin', origin]);
  git(work, ['push', '--quiet', '-u', 'origin', 'main']);

  return {
    base,
    origin,
    work,
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/** Возвращает (создавая при необходимости) второй клон, играющий роль `main`. */
export function mainClone(fixture) {
  const other = join(fixture.base, 'other');
  if (!existsSync(join(other, '.git'))) {
    git(fixture.base, ['clone', '--quiet', fixture.origin, other]);
    configure(other, 'Main Author');
    git(other, ['checkout', '--quiet', '-B', 'main', 'origin/main']);
  } else {
    git(other, ['fetch', '--quiet', 'origin']);
    git(other, ['checkout', '--quiet', 'main']);
    git(other, ['reset', '--quiet', '--hard', 'origin/main']);
  }
  return other;
}

/** Продвигает `origin/main` одним коммитом: объект `{ путь: содержимое }`. */
export function advanceOriginMain(fixture, changes, message = 'main: advance') {
  const other = mainClone(fixture);
  writeChanges(other, changes);
  git(other, ['add', '-A']);
  git(other, ['commit', '--quiet', '-m', message]);
  git(other, ['push', '--quiet', 'origin', 'main']);
  return other;
}

/** Создаёт в рабочем клоне ветку задачи и коммитит в неё изменения. */
export function featureBranch(fixture, branch, changes, message = 'feature: change') {
  git(fixture.work, ['checkout', '--quiet', '-b', branch]);
  writeChanges(fixture.work, changes);
  git(fixture.work, ['add', '-A']);
  git(fixture.work, ['commit', '--quiet', '-m', message]);
  return git(fixture.work, ['rev-parse', 'HEAD']);
}

function writeChanges(cwd, changes) {
  for (const [file, content] of Object.entries(changes)) {
    const target = join(cwd, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
