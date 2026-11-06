import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Владение таблицами — core-modules §2. Репозиторий модуля не читает и не
// пишет чужие таблицы: только через порт или read-model владельца (§1.4).
const MODULES = path.resolve(import.meta.dirname, '../../src/main/modules');
const OWNED: Record<string, readonly string[]> = {
  catalog: ['property', 'property_type'],
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

describe('границы данных модулей', () => {
  it('репозитории обращаются только к таблицам своего модуля', () => {
    const scanned: string[] = [];
    const violations: string[] = [];
    for (const module of readdirSync(MODULES, { withFileTypes: true })) {
      const adapters = path.join(MODULES, module.name, 'adapters');
      const owned = OWNED[module.name];
      if (!module.isDirectory() || owned === undefined) continue;
      let files: string[];
      try {
        files = repositoryFiles(adapters);
      } catch {
        continue; // у модуля ещё нет адаптеров
      }
      for (const file of files) {
        scanned.push(path.basename(file));
        for (const table of tablesInSql(readFileSync(file, 'utf8'))) {
          if (!owned.includes(table)) {
            violations.push(`${module.name}/${path.basename(file)}: ${table}`);
          }
        }
      }
    }
    expect(scanned).toContain('sqlite-catalog-repository.ts');
    expect(violations).toEqual([]);
  });

  it('проверка не пропускает чужую таблицу', () => {
    expect(tablesInSql('SELECT * FROM property p JOIN profile ON profile.id = p.id')).toEqual([
      'property',
      'profile',
    ]);
  });
});
