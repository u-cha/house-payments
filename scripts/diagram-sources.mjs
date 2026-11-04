#!/usr/bin/env node
/**
 * diagram-sources.mjs — список текстовых источников диаграмм.
 *
 * Возвращает пути относительно корня проекта:
 *   docs/**\/*.mmd, docs/**\/*.dbml
 * По умолчанию исключает `_examples` (рендерятся по явному запросу).
 *
 * Используется scripts/render-diagrams.sh; тест — tests/diagram-sources.test.mjs.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXCLUDED_DIRS = new Set(['_examples', '_archive', 'node_modules', '.git']);

/** @returns {string[]} относительные пути (posix), отсортированные */
export function listDiagramSources(root = process.cwd(), { includeExamples = false } = {}) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (EXCLUDED_DIRS.has(entry) && !(includeExamples && entry === '_examples')) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.mmd') || entry.endsWith('.dbml')) {
        out.push(relative(root, full).split(sep).join('/'));
      }
    }
  };
  const docs = join(root, 'docs');
  if (existsSync(docs)) walk(docs);
  return out.sort();
}

function main() {
  const includeExamples = process.argv.includes('--with-examples');
  const root = process.cwd();
  process.stdout.write(`${listDiagramSources(root, { includeExamples }).join('\n')}\n`);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
