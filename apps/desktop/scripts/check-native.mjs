/* global process */
// R-03: нативная зависимость должна загружаться в Electron, а не только в Node.
// Скрипт запускается самим Electron в режиме Node:
//   ELECTRON_RUN_AS_NODE=1 electron scripts/check-native.mjs
// Отдельный файл (а не `electron -e "..."`) нужен, чтобы шаг CI одинаково
// работал в bash на macOS/Linux и на Windows, где многострочный -e ломается.
import Database from 'better-sqlite3';

if (!process.versions.electron) {
  throw new Error('скрипт должен запускаться Electron (ELECTRON_RUN_AS_NODE=1)');
}

const db = new Database(':memory:');
try {
  const row = db.prepare('select 1 as x').get();
  if (row.x !== 1) throw new Error('better-sqlite3: запрос не выполнен');
} finally {
  db.close();
}

process.stdout.write(`better-sqlite3 загружен в Electron ${process.versions.electron}\n`);
