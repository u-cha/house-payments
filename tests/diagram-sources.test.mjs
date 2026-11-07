import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { listDiagramSources } from '../scripts/diagram-sources.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('listDiagramSources: находит .mmd и .dbml рекурсивно', () => {
  const sources = listDiagramSources(root);
  assert.ok(sources.length >= 8, `ожидалось ≥ 8 источников, найдено ${sources.length}`);
  assert.ok(sources.includes('docs/design/domain/model.dbml'));
  assert.ok(sources.includes('docs/design/architecture/components.mmd'));
  assert.ok(sources.includes('docs/design/domain/lifecycles/meter.mmd'));
});

test('listDiagramSources: по умолчанию исключает _examples', () => {
  const sources = listDiagramSources(root);
  assert.equal(sources.some((s) => s.includes('/_examples/')), false);
});

test('listDiagramSources: --with-examples добавляет примеры', () => {
  const sources = listDiagramSources(root, { includeExamples: true });
  assert.ok(sources.some((s) => s.includes('/_examples/')));
});
