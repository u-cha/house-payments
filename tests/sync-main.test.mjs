import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { advanceOriginMain, createFixture, featureBranch, git, gitResult } from './git-fixture.mjs';

const SCRIPT = resolve(import.meta.dirname, '../scripts/sync-main.mjs');

function runSync(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

test('sync-main: свежий main не трогает ветку и ничего не коммитит', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  featureBranch(fixture, 'fix/t-test-feature', { 'note.md': 'feature\n' });
  const before = git(fixture.work, ['rev-parse', 'HEAD']);

  const result = runSync(fixture.work);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /уже содержит свежий origin\/main/);
  assert.equal(git(fixture.work, ['rev-parse', 'HEAD']), before);
});

test('sync-main: подливает новый main обычным merge, без rebase', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  featureBranch(fixture, 'fix/t-test-feature', { 'feature/one.md': 'feature\n' });
  advanceOriginMain(fixture, { 'main/two.md': 'main\n' });

  const result = runSync(fixture.work);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /подливаю origin\/main/);
  // main — предок HEAD, оба файла на месте, ветка не переписана.
  assert.equal(gitResult(fixture.work, ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']).status, 0);
  assert.match(readFileSync(join(fixture.work, 'main/two.md'), 'utf8'), /main/);
  assert.match(readFileSync(join(fixture.work, 'feature/one.md'), 'utf8'), /feature/);
  const parents = git(fixture.work, ['rev-list', '--parents', '-1', 'HEAD']).split(' ');
  assert.equal(parents.length, 3, 'merge-коммит должен иметь двух родителей, а не быть rebase');
});

test('sync-main: конфликт — код 1, список файлов, без выбора стороны', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  featureBranch(fixture, 'fix/t-test-feature', { 'README.md': 'feature-side\n' });
  advanceOriginMain(fixture, { 'README.md': 'main-side\n' });
  const before = git(fixture.work, ['rev-parse', 'HEAD']);

  const result = runSync(fixture.work);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /Конфликт слияния/);
  assert.match(output, /README\.md/);
  assert.match(output, /спроси пользователя/);
  assert.equal(gitResult(fixture.work, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status, 0, 'merge должен остаться незавершённым');
  assert.equal(git(fixture.work, ['rev-parse', 'HEAD']), before, 'скрипт не должен создавать коммит');
  const conflicted = readFileSync(join(fixture.work, 'README.md'), 'utf8');
  assert.match(conflicted, /^<<<<<<< /m, 'конфликт не должен быть «разрешён» автоматически');

  git(fixture.work, ['merge', '--abort']);
});

test('sync-main: незавершённый merge останавливает повторный запуск (код 1)', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  featureBranch(fixture, 'fix/t-test-feature', { 'README.md': 'feature-side\n' });
  advanceOriginMain(fixture, { 'README.md': 'main-side\n' });
  runSync(fixture.work);
  writeFileSync(join(fixture.work, 'README.md'), 'resolved\n');

  const result = runSync(fixture.work);

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /незавершённый merge/);
  git(fixture.work, ['merge', '--abort']);
});

test('sync-main: не git-репозиторий — код 2', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'house-payments-plain-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [SCRIPT], { cwd: base, encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /не git-репозиторий/);
});

test('sync-main: detached HEAD — код 2', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  featureBranch(fixture, 'fix/t-test-feature', { 'note.md': 'feature\n' });
  git(fixture.work, ['checkout', '--quiet', '--detach']);

  const result = runSync(fixture.work);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /detached HEAD/);
});
