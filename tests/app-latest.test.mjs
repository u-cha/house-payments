// ADR-0018: `pnpm app:latest` — одна команда ручной проверки. Тесты держат
// выбор прогона, фиксированные имена артефактов и распаковку по платформам:
// ошибка здесь означает, что пользователь проверяет не тот экземпляр.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PLATFORM_ARTIFACTS,
  UsageError,
  artifactForPlatform,
  findFile,
  findRun,
  parseArgs,
  prepare,
  resetDir,
} from '../scripts/app-latest.mjs';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'app-latest-'));

// ---------------------------------------------------------------------------
// Аргументы
// ---------------------------------------------------------------------------

test('parseArgs: по умолчанию последний зелёный main, приложение открывается', () => {
  const options = parseArgs([]);
  assert.equal(options.run, undefined);
  assert.equal(options.branch, 'main');
  assert.equal(options.platform, process.platform);
  assert.equal(options.print, false);
  assert.equal(options.open, true);
});

test('parseArgs: --run, --branch, --print и --no-open', () => {
  const run = parseArgs(['--run', '123', '--branch', 'chore/x']);
  assert.equal(run.run, '123');
  assert.equal(run.branch, 'chore/x');

  const print = parseArgs(['--print']);
  assert.equal(print.print, true);
  assert.equal(print.open, false);

  assert.equal(parseArgs(['--no-open']).open, false);
});

test('parseArgs: неизвестный аргумент — ошибка аргументов', () => {
  assert.throws(() => parseArgs(['--wat']), UsageError);
  assert.throws(() => parseArgs(['--run']), UsageError);
});

// ---------------------------------------------------------------------------
// Артефакты и прогоны
// ---------------------------------------------------------------------------

test('artifactForPlatform: фиксированные имена latest-* из ADR-0018', () => {
  assert.deepEqual(PLATFORM_ARTIFACTS, {
    darwin: 'house-payments-mac-latest',
    win32: 'house-payments-win-latest',
    linux: 'house-payments-linux-latest',
  });
  assert.equal(artifactForPlatform('darwin'), 'house-payments-mac-latest');
  assert.throws(() => artifactForPlatform('freebsd'), UsageError);
});

test('findRun: gh run list с зелёным main, берётся первый (самый свежий)', () => {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return JSON.stringify([
      { databaseId: 42, headSha: 'abc', createdAt: '2026-11-07T00:00:00Z', url: 'u' },
      { databaseId: 41, headSha: 'def', createdAt: '2026-11-06T00:00:00Z', url: 'u' },
    ]);
  };
  assert.deepEqual(findRun(gh, { branch: 'main' }), {
    databaseId: 42,
    headSha: 'abc',
    createdAt: '2026-11-07T00:00:00Z',
    url: 'u',
  });
  const args = calls[0];
  assert.deepEqual(args.slice(0, 2), ['run', 'list']);
  assert.ok(args.includes('--status'));
  assert.ok(args.includes('success'));
  assert.ok(args.includes('--branch'));
});

test('findRun: --run берёт указанный прогон без обращения к gh', () => {
  const gh = () => assert.fail('gh не должен вызываться');
  assert.deepEqual(findRun(gh, { run: '777', branch: 'main' }), { databaseId: 777 });
});

test('findRun: нет зелёных прогонов — понятная ошибка', () => {
  assert.throws(() => findRun(() => '[]', { branch: 'main' }), /нет зелёных прогонов/);
});

// ---------------------------------------------------------------------------
// Распаковка
// ---------------------------------------------------------------------------

test('resetDir: предыдущее содержимое перезаписывается, каталог создаётся заново', () => {
  const dir = path.join(tempDir(), 'app-latest');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'old.txt'), 'old');
  resetDir(dir);
  assert.equal(fs.existsSync(path.join(dir, 'old.txt')), false);
  assert.equal(fs.readdirSync(dir).length, 0);
});

test('findFile: находит файл в подкаталоге', () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'nested'));
  const file = path.join(dir, 'nested', 'x.exe');
  fs.writeFileSync(file, '');
  assert.equal(findFile(dir, (name) => name.endsWith('.exe')), file);
  assert.equal(findFile(dir, (name) => name.endsWith('.dmg')), undefined);
});

test('prepare(darwin): монтирует dmg, копирует .app и открывает его', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'house-payments.dmg'), 'fake');
  const commands = [];
  const run = (command, args) => {
    commands.push([command, ...args]);
    if (command === 'hdiutil' && args[0] === 'attach') {
      fs.mkdirSync(path.join(args[4], 'house-payments.app'));
    }
    if (command === 'ditto') fs.mkdirSync(args[1], { recursive: true });
  };
  const target = prepare('darwin', dir, { run });
  assert.equal(target.command, 'open');
  assert.ok(target.args[0].endsWith('house-payments.app'));
  assert.ok(fs.existsSync(target.args[0]));
  assert.ok(commands.some(([command, action]) => command === 'hdiutil' && action === 'attach'));
  assert.ok(commands.some(([command]) => command === 'ditto'));
  assert.ok(commands.some(([command, action]) => command === 'hdiutil' && action === 'detach'));
});

test('prepare(linux): AppImage не распаковался — запуск образа напрямую', () => {
  const dir = tempDir();
  const image = path.join(dir, 'house-payments.AppImage');
  fs.writeFileSync(image, 'fake');
  const run = () => {
    throw new Error('FUSE нет');
  };
  const target = prepare('linux', dir, { run });
  assert.equal(target.command, image);
  assert.deepEqual(target.args, ['--no-sandbox']);
});

test('prepare(win32): zip с приложением предпочтительнее установщика', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'house-payments-setup.exe'), 'fake');
  const zip = path.join(dir, 'house-payments.zip');
  fs.writeFileSync(zip, 'fake');
  const run = (command, args) => {
    const destination = args.at(-1).match(/DestinationPath '([^']+)'/)[1];
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, 'house-payments.exe'), 'fake');
  };
  const target = prepare('win32', dir, { run });
  assert.ok(target.command.endsWith('house-payments.exe'));
  assert.ok(!target.command.includes('setup'));
});

test('prepare(win32): без zip открывается NSIS-установщик', () => {
  const dir = tempDir();
  const installer = path.join(dir, 'house-payments-win-x64-latest.exe');
  fs.writeFileSync(installer, 'fake');
  const target = prepare('win32', dir, { run: () => {} });
  assert.equal(target.command, installer);
});

test('prepare: пустой артефакт — ошибка, а не запуск мусора', () => {
  assert.throws(() => prepare('darwin', tempDir(), { run: () => {} }), /нет \.dmg/);
  assert.throws(() => prepare('win32', tempDir(), { run: () => {} }), /нет \.exe/);
});
