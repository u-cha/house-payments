// ADR-0019: имя и место артефакта — часть контракта сдачи итерации.
// ADR-0018: у каждой ОС фиксированное имя latest-*; CI публикует его как артефакт.
// Тест держит конфигурацию сборки и документацию в согласии, чтобы переименование
// артефакта не оставило в README/AGENTS.md/roadmap/ADR мёртвую ссылку.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_CONFIG,
  artifactLink,
  artifactName,
  artifactNames,
} from '../apps/desktop/scripts/print-artifact.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_NAME = 'house-payments-mac-arm64-latest.dmg';
const EXPECTED_LINK = `release/${EXPECTED_NAME}`;

// Имена для трёх ОС: их же публикует CI, их ищет scripts/app-latest.mjs.
const EXPECTED_NAMES = {
  mac: 'house-payments-mac-arm64-latest.dmg',
  win: 'house-payments-win-x64-latest.exe',
  linux: 'house-payments-linux-x64-latest.AppImage',
};

const DOCUMENTED_IN = [
  'README.md',
  'AGENTS.md',
  'CHANGELOG.md',
  'docs/design/roadmap.md',
  'docs/design/architecture/adr/0019-iteration-artifact-and-link.md',
];

test('electron-builder.yml задаёт стабильные имена артефактов без версии', () => {
  const config = readFileSync(join(repoRoot, ARTIFACT_CONFIG), 'utf8');
  assert.equal(artifactName(config), EXPECTED_NAME);
  assert.deepEqual(artifactNames(config), EXPECTED_NAMES);
});

test('путь артефакта — единственный release/ в корне репозитория', () => {
  assert.equal(artifactLink(repoRoot), EXPECTED_LINK);
  assert.equal(artifactLink(repoRoot, 'win'), 'release/house-payments-win-x64-latest.exe');
  assert.equal(artifactLink(repoRoot, 'linux'), 'release/house-payments-linux-x64-latest.AppImage');
});

test('документация называет тот же путь, что и сборка', () => {
  for (const file of DOCUMENTED_IN) {
    const text = readFileSync(join(repoRoot, file), 'utf8');
    assert.ok(text.includes(EXPECTED_LINK), `${file} должен упоминать ${EXPECTED_LINK}`);
  }
});
