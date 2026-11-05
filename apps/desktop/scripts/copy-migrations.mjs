import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// tsc переносит только .ts, а миграции — SQL-файлы: копируем их в dist рядом с
// раннером, чтобы путь `infrastructure/db/migrations` работал и в сборке.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(scriptDir, '../src/main');
const target = path.join(scriptDir, '../dist/node/main');

function copySql(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copySql(src, dst);
    } else if (entry.name.endsWith('.sql')) {
      mkdirSync(to, { recursive: true });
      copyFileSync(src, dst);
    }
  }
}

copySql(source, target);
