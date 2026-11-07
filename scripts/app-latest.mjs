#!/usr/bin/env node
// ADR-0018: `pnpm app:latest` — одна команда ручной проверки запускаемого
// экземпляра. Находит последний зелёный прогон ci.yml на main, скачивает артефакт
// house-payments-<os>-latest, распаковывает в .app-latest/ (перезапись) и
// открывает приложение. Локальная сборка при этом не выполняется.
//
// Примеры:
//   pnpm app:latest                 # последний зелёный прогон main
//   pnpm app:latest --run 123456    # конкретный прогон (ручная проверка ветки)
//   pnpm app:latest --print         # только распаковать и напечатать путь
//   pnpm app:latest --no-open       # скачать, ничего не запускать
//
// Коды выхода: 0 — успех, 1 — ошибка gh/артефакта/запуска, 64 — ошибка аргументов.
// Авторизацию целиком берёт на себя gh; секретов скрипт не читает.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { WORKFLOW_FILE } from './ci-status.mjs';

/** Каталог распакованного артефакта; в .gitignore (ADR-0018). */
export const APP_DIR = '.app-latest';
export const DEFAULT_BRANCH = 'main';

export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 64;

/** Платформа → фиксированное имя артефакта CI (ADR-0018). */
export const PLATFORM_ARTIFACTS = {
  darwin: 'house-payments-mac-latest',
  win32: 'house-payments-win-latest',
  linux: 'house-payments-linux-latest',
};

const USAGE = `Скачивание и запуск последнего артефакта CI (ADR-0018).

Использование:
  pnpm app:latest [--run <id>] [--branch <имя>] [--print] [--no-open]

Опции:
      --run <id>       прогон ci.yml; по умолчанию — последний зелёный main
      --branch <имя>   ветка для поиска прогона, по умолчанию ${DEFAULT_BRANCH}
      --print          распаковать в ${APP_DIR}/ и напечатать путь, не запуская
      --no-open        скачать и распаковать, приложение не запускать
  -h, --help           эта справка

Локальная сборка не выполняется: проверяется ровно артефакт CI (ADR-0018).`;

export class UsageError extends Error {}

/** Имя артефакта для платформы; неподдерживаемая платформа — ошибка аргументов. */
export function artifactForPlatform(platform) {
  const name = PLATFORM_ARTIFACTS[platform];
  if (!name) throw new UsageError(`платформа ${platform} не поддерживается (darwin/win32/linux)`);
  return name;
}

/** Разбирает аргументы командной строки. */
export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    run: undefined,
    branch: DEFAULT_BRANCH,
    platform: process.platform,
    print: false,
    open: true,
    help: false,
  };
  const value = (name, next) => {
    if (next === undefined || next.startsWith('-')) throw new UsageError(`для ${name} нужно значение`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run') options.run = value('--run', argv[++index]);
    else if (arg === '--branch') options.branch = value('--branch', argv[++index]);
    else if (arg === '--print') { options.print = true; options.open = false; }
    else if (arg === '--no-open') options.open = false;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new UsageError(`неизвестный аргумент: ${arg}`);
  }
  return options;
}

/** Последний зелёный прогон ci.yml (или явно указанный --run). */
export function findRun(gh, { run, branch }) {
  if (run !== undefined) {
    const id = Number(run);
    if (!Number.isInteger(id) || id <= 0) throw new UsageError(`--run ожидает номер прогона, получено: ${run}`);
    return { databaseId: id };
  }
  const raw = gh([
    'run', 'list',
    '--workflow', WORKFLOW_FILE,
    '--branch', branch,
    '--status', 'success',
    '--limit', '1',
    '--json', 'databaseId,headSha,createdAt,url',
  ]);
  const runs = JSON.parse(raw || '[]');
  if (runs.length === 0) {
    throw new Error(`нет зелёных прогонов ${WORKFLOW_FILE} на ветке ${branch}`);
  }
  return runs[0];
}

/** Очищает каталог и создаёт пустой: предыдущее содержимое перезаписывается. */
export function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Первый файл под dir (рекурсивно), подходящий под предикат. */
export function findFile(dir, predicate) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(full, predicate);
      if (nested) return nested;
    } else if (predicate(full)) {
      return full;
    }
  }
  return undefined;
}

/**
 * Готовит запускаемый экземпляр из скачанного артефакта и возвращает команду
 * запуска: macOS — `.app` из `.dmg`, Linux — AppImage, Windows — zip с приложением.
 */
export function prepare(platform, dir, { run = defaultRun, log = () => {} } = {}) {
  if (platform === 'darwin') {
    const dmg = findFile(dir, (file) => file.endsWith('.dmg'));
    if (!dmg) throw new Error('в артефакте нет .dmg');
    const mount = path.join(dir, 'mnt');
    fs.mkdirSync(mount, { recursive: true });
    log(`Монтирую ${path.basename(dmg)}`);
    run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
    try {
      const app = fs.readdirSync(mount).find((name) => name.endsWith('.app'));
      if (!app) throw new Error('в .dmg нет .app');
      const dest = path.join(dir, app);
      log(`Копирую ${app} в ${APP_DIR}/`);
      run('ditto', [path.join(mount, app), dest]);
      return { command: 'open', args: [dest] };
    } finally {
      run('hdiutil', ['detach', mount]);
    }
  }

  if (platform === 'linux') {
    const image = findFile(dir, (file) => file.endsWith('.AppImage'));
    if (!image) throw new Error('в артефакте нет .AppImage');
    fs.chmodSync(image, 0o755);
    log(`Распаковываю ${path.basename(image)}`);
    try {
      run(image, ['--appimage-extract'], { cwd: dir, stdio: 'ignore' });
      const appRun = path.join(dir, 'squashfs-root', 'AppRun');
      if (!fs.existsSync(appRun)) throw new Error('нет squashfs-root/AppRun');
      return { command: appRun, args: [] };
    } catch {
      // Без FUSE (или без прав на распаковку) запускаем образ напрямую.
      return { command: image, args: ['--no-sandbox'] };
    }
  }

  if (platform === 'win32') {
    const zip = findFile(dir, (file) => file.endsWith('.zip'));
    if (zip) {
      const target = path.join(dir, 'app');
      log(`Распаковываю ${path.basename(zip)}`);
      run('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${target}' -Force`,
      ]);
      const exe = findFile(target, (file) => file.endsWith('.exe'));
      if (!exe) throw new Error('в zip нет .exe');
      return { command: exe, args: [] };
    }
    const installer = findFile(dir, (file) => file.endsWith('.exe'));
    if (!installer) throw new Error('в артефакте нет .exe');
    // Установщик NSIS: приложение ставится per-user, без прав администратора.
    return { command: installer, args: [] };
  }

  throw new UsageError(`платформа ${platform} не поддерживается`);
}

function defaultRun(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options });
}

/** Запускает приложение, не удерживая терминал (macOS `open` — сам по себе). */
export function launch({ command, args }, { spawnImpl = spawn } = {}) {
  const child = spawnImpl(command, args, { detached: true, stdio: 'ignore' });
  if (typeof child.unref === 'function') child.unref();
  return child;
}

function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_SUCCESS;
  }
  const artifact = artifactForPlatform(options.platform);
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });
  const run = findRun(gh, options);
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const dir = path.join(repoRoot, APP_DIR);
  resetDir(dir);
  process.stdout.write(`Артефакт: ${artifact} (прогон ${run.databaseId})\n`);
  gh(['run', 'download', String(run.databaseId), '--name', artifact, '--dir', dir]);
  const target = prepare(options.platform, dir, {
    log: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`Экземпляр: ${target.command}\n`);
  if (options.open) launch(target);
  return EXIT_SUCCESS;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(error instanceof UsageError ? EXIT_USAGE : EXIT_FAILURE);
  }
}
