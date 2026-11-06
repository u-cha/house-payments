import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER = path.resolve(import.meta.dirname, '../../src/renderer');

function rendererSources(dir = RENDERER): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return rendererSources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Граница слоёв (core-modules §3): renderer — только UI и вызовы IPC, без Node,
 * Electron, SQLite и внутренностей main. Архитектурные тесты M0-12: depcruise
 * покрывает импорты, здесь — Node-модули, SQL и прямые пути в main.
 */
describe('границы renderer', () => {
  it('не импортирует Node, Electron, better-sqlite3 и слои main', () => {
    const forbidden = [/from ['"]node:/, /from ['"]electron['"]/, /from ['"]better-sqlite3['"]/];
    const offenders = rendererSources().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const relative = path.relative(RENDERER, file);
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative} соответствует ${String(pattern)}`);
    });
    expect(offenders).toEqual([]);
  });

  it('не обращается к main/infrastructure и не содержит SQL', () => {
    const offenders = rendererSources().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const relative = path.relative(RENDERER, file);
      const checks = [
        { ok: !/from ['"][^'"]*main\//.test(source), reason: 'импорт main/' },
        { ok: !/from ['"][^'"]*infrastructure\//.test(source), reason: 'импорт infrastructure/' },
        {
          ok: !/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/.test(source),
          reason: 'SQL',
        },
      ];
      return checks.filter((check) => !check.ok).map((check) => `${relative}: ${check.reason}`);
    });
    expect(offenders).toEqual([]);
  });
});
