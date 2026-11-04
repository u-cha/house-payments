import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { advanceOriginMain, createFixture, featureBranch, git, gitResult } from './git-fixture.mjs';

const HOOK = resolve(import.meta.dirname, '../.githooks/pre-push');
const ZERO = '0000000000000000000000000000000000000000';

function runHook(cwd, refs, remote = 'origin') {
  return spawnSync('bash', [HOOK, remote], {
    cwd,
    encoding: 'utf8',
    input: refs.map((ref) => ref.join(' ')).join('\n') + '\n',
  });
}

function branchRef(name, sha) {
  return [`refs/heads/${name}`, sha, `refs/heads/${name}`, ZERO];
}

test('pre-push: ветка без свежего main блокируется с подсказкой', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  const sha = featureBranch(fixture, 'fix/t-test-feature', { 'feature.md': 'feature\n' });
  advanceOriginMain(fixture, { 'main.md': 'main\n' });

  const result = runHook(fixture.work, [branchRef('fix/t-test-feature', sha)]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /не содержит свежий origin\/main/);
  assert.match(output, /pnpm sync:main/);
  assert.match(output, /спроси пользователя/);
});

test('pre-push: после sync-main ветка пропускается', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  featureBranch(fixture, 'fix/t-test-feature', { 'feature.md': 'feature\n' });
  advanceOriginMain(fixture, { 'main.md': 'main\n' });
  git(fixture.work, ['fetch', '--quiet', 'origin']);
  git(fixture.work, ['merge', '--quiet', '--no-edit', 'origin/main']);
  const sha = git(fixture.work, ['rev-parse', 'HEAD']);

  const result = runHook(fixture.work, [branchRef('fix/t-test-feature', sha)]);

  assert.equal(result.status, 0, result.stderr);
});

test('pre-push: пуш в main запрещён', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  const sha = git(fixture.work, ['rev-parse', 'HEAD']);

  const result = runHook(fixture.work, [branchRef('main', sha)]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /push в main запрещён/);
});

test('pre-push: удаление ветки и пуш тега не блокируются', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());

  const deletion = [['(delete)', ZERO, 'refs/heads/old-feature', 'abc123']];
  const tag = [['refs/tags/v0.0.1', git(fixture.work, ['rev-parse', 'HEAD']), 'refs/tags/v0.0.1', ZERO]];

  assert.equal(runHook(fixture.work, deletion).status, 0);
  assert.equal(runHook(fixture.work, tag).status, 0);
});

test('pre-push: незавершённый merge блокируется', (t) => {
  const fixture = createFixture();
  t.after(() => fixture.cleanup());
  featureBranch(fixture, 'fix/t-test-feature', { 'README.md': 'feature-side\n' });
  advanceOriginMain(fixture, { 'README.md': 'main-side\n' });
  git(fixture.work, ['fetch', '--quiet', 'origin']);
  gitResult(fixture.work, ['merge', '--no-edit', 'origin/main']);
  assert.equal(gitResult(fixture.work, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status, 0);

  const result = runHook(fixture.work, [branchRef('fix/t-test-feature', git(fixture.work, ['rev-parse', 'HEAD']))]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /незавершённый merge/);
  git(fixture.work, ['merge', '--abort']);
});
