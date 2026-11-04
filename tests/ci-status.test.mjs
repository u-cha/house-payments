import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXIT_FAILURE,
  EXIT_PENDING,
  EXIT_SUCCESS,
  UsageError,
  exitCodeForRun,
  formatRun,
  parseArgs,
  selectRun,
  shortSha,
} from '../scripts/ci-status.mjs';

const run = (overrides = {}) => ({
  databaseId: 100,
  workflowName: 'CI',
  headBranch: 'test/t-mw29vbip-ci-tests',
  headSha: 'abcdef1234567890',
  status: 'completed',
  conclusion: 'success',
  createdAt: '2026-11-04T15:00:00Z',
  url: 'https://github.com/u-cha/house-payments/actions/runs/100',
  event: 'push',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Аргументы
// ---------------------------------------------------------------------------

test('parseArgs: значения по умолчанию — текущая ветка, без ожидания', () => {
  const options = parseArgs([]);
  assert.equal(options.branch, undefined);
  assert.equal(options.commit, undefined);
  assert.equal(options.pr, undefined);
  assert.equal(options.limit, 10);
  assert.equal(options.wait, false);
  assert.equal(options.interval, 10);
  assert.equal(options.timeout, 1800);
  assert.equal(options.json, false);
});

test('parseArgs: разбирает цель, лимит, ожидание и JSON', () => {
  const options = parseArgs(['--branch', 'main', '--limit', '3', '--wait=30', '--json']);
  assert.equal(options.branch, 'main');
  assert.equal(options.limit, 3);
  assert.equal(options.wait, true);
  assert.equal(options.interval, 30);
  assert.equal(options.json, true);
});

test('parseArgs: --commit, --pr, --repo и --timeout', () => {
  const commit = parseArgs(['--commit', 'abcdef1', '--repo', 'u-cha/house-payments', '--timeout', '60']);
  assert.equal(commit.commit, 'abcdef1');
  assert.equal(commit.repo, 'u-cha/house-payments');
  assert.equal(commit.timeout, 60);

  const pr = parseArgs(['--pr', '12']);
  assert.equal(pr.pr, 12);
});

test('parseArgs: цели взаимоисключающие', () => {
  assert.throws(
    () => parseArgs(['--branch', 'main', '--commit', 'abcdef1']),
    (error) => error instanceof UsageError && /взаимоисключающие/.test(error.message),
  );
  assert.throws(
    () => parseArgs(['--pr', '12', '--branch', 'main']),
    (error) => error instanceof UsageError && /взаимоисключающие/.test(error.message),
  );
});

test('parseArgs: неизвестный аргумент и нечисловое значение — ошибка', () => {
  assert.throws(() => parseArgs(['--nope']), UsageError);
  assert.throws(() => parseArgs(['--limit', 'много']), /положительное целое/);
  assert.throws(() => parseArgs(['--wait=0']), /положительное целое/);
  assert.throws(() => parseArgs(['--branch']), /нужно значение/);
});

test('parseArgs: --help распознаётся', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

// ---------------------------------------------------------------------------
// Выбор прогона
// ---------------------------------------------------------------------------

test('selectRun: берёт самый свежий прогон по createdAt', () => {
  const runs = [
    run({ databaseId: 1, createdAt: '2026-11-04T14:00:00Z' }),
    run({ databaseId: 2, createdAt: '2026-11-04T16:00:00Z' }),
    run({ databaseId: 3, createdAt: '2026-11-04T15:00:00Z' }),
  ];
  assert.equal(selectRun(runs, {}).databaseId, 2);
});

test('selectRun: фильтрует по ветке и коммиту', () => {
  const runs = [
    run({ databaseId: 1, headBranch: 'main' }),
    run({ databaseId: 2, headBranch: 'test/x', headSha: '1111111' }),
    run({ databaseId: 3, headBranch: 'test/x', headSha: '2222222', createdAt: '2026-11-04T17:00:00Z' }),
  ];
  assert.equal(selectRun(runs, { branch: 'main' }).databaseId, 1);
  assert.equal(selectRun(runs, { branch: 'test/x' }).databaseId, 3);
  assert.equal(selectRun(runs, { branch: 'test/x', commit: '1111111' }).databaseId, 2);
});

test('selectRun: нет совпадений — null', () => {
  assert.equal(selectRun([], {}), null);
  assert.equal(selectRun([run()], { branch: 'main' }), null);
  assert.equal(selectRun([run()], { commit: '0000000' }), null);
});

// ---------------------------------------------------------------------------
// Итог и вывод
// ---------------------------------------------------------------------------

test('exitCodeForRun: успех, провал, незавершённый и отсутствие прогона', () => {
  assert.equal(exitCodeForRun(run()), EXIT_SUCCESS);
  assert.equal(exitCodeForRun(run({ conclusion: 'failure' })), EXIT_FAILURE);
  assert.equal(exitCodeForRun(run({ status: 'in_progress', conclusion: null })), EXIT_PENDING);
  assert.equal(exitCodeForRun(null), EXIT_PENDING);
});

test('shortSha: первые 7 символов', () => {
  assert.equal(shortSha('abcdef1234567890'), 'abcdef1');
  assert.equal(shortSha(undefined), '');
});

test('formatRun: описывает прогон, ветку, коммит и ссылку', () => {
  const text = formatRun(run());
  assert.match(text, /run 100/);
  assert.match(text, /ветка: test\/t-mw29vbip-ci-tests/);
  assert.match(text, /коммит: abcdef1/);
  assert.match(text, /итог: success/);
  assert.match(text, /actions\/runs\/100/);
});

test('formatRun: подсказывает логи для провала и ожидание для незавершённого', () => {
  assert.match(formatRun(run({ conclusion: 'failure' })), /gh run view 100 --log-failed/);
  assert.match(formatRun(run({ status: 'queued', conclusion: null })), /--wait/);
  assert.match(formatRun(null), /не найдены/);
});
