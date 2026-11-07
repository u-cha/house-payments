import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Владение таблицами — core-modules §2. Репозиторий модуля не читает и не
// пишет чужие таблицы: только через порт или read-model владельца (§1.4).
const MODULES = path.resolve(import.meta.dirname, '../../src/main/modules');
const OWNED: Record<string, readonly string[]> = {
  catalog: ['property', 'property_type', 'supplier'],
};
const KEYWORDS = new Set(['select', 'set', 'values', 'where', 'as', 'on']);

/** Таблицы, к которым обращается SQL из строковых литералов файла. */
export function tablesInSql(sql: string): string[] {
  const found = new Set<string>();
  for (const match of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
    const table = (match[1] ?? '').toLowerCase();
    if (!KEYWORDS.has(table)) found.add(table);
  }
  return [...found];
}

function repositoryFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return repositoryFiles(full);
    return /repository.*\.ts$/.test(entry.name) ? [full] : [];
  });
}

interface Scan {
  scanned: string[];
  violations: string[];
}

export function scanModules(modulesDir: string, owned: Record<string, readonly string[]>): Scan {
  const result: Scan = { scanned: [], violations: [] };
  for (const module of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!module.isDirectory()) continue;
    let files: string[];
    try {
      files = repositoryFiles(path.join(modulesDir, module.name, 'adapters'));
    } catch {
      continue; // у модуля ещё нет адаптеров
    }
    if (files.length === 0) continue;
    // Модуль с репозиторием обязан быть в OWNED: иначе проверка молча пропустит
    // его таблицы и граница данных перестанет быть автоматической.
    const tables = owned[module.name];
    if (tables === undefined) {
      result.violations.push(`${module.name}: модуль с репозиторием не описан в OWNED`);
      continue;
    }
    for (const file of files) {
      result.scanned.push(path.basename(file));
      for (const table of tablesInSql(readFileSync(file, 'utf8'))) {
        if (!tables.includes(table)) {
          result.violations.push(`${module.name}/${path.basename(file)}: ${table}`);
        }
      }
    }
  }
  return result;
}

describe('границы данных модулей', () => {
  it('репозитории обращаются только к таблицам своего модуля', () => {
    const { scanned, violations } = scanModules(MODULES, OWNED);
    expect(scanned).toContain('sqlite-catalog-repository.ts');
    expect(violations).toEqual([]);
  });

  it('модуль с репозиторием без записи в OWNED — нарушение, а не пропуск', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'house-payments-owned-'));
    mkdirSync(path.join(dir, 'metering/adapters'), { recursive: true });
    writeFileSync(
      path.join(dir, 'metering/adapters/sqlite-metering-repository.ts'),
      'SELECT * FROM meter',
    );
    try {
      expect(scanModules(dir, {}).violations).toEqual([
        'metering: модуль с репозиторием не описан в OWNED',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('проверка не пропускает чужую таблицу', () => {
    expect(tablesInSql('SELECT * FROM property p JOIN profile ON profile.id = p.id')).toEqual([
      'property',
      'profile',
    ]);
  });
});
