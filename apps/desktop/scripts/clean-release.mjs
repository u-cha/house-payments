/* global process */
// ADR-0018: локальные сборки живут в единственном release/ и перезаписываются.
// Чистим каталог перед сборкой, чтобы после смены версии не осталось старых .dmg.
import fs from 'node:fs';
import path from 'node:path';

const releaseDir = path.resolve(import.meta.dirname, '../../../release');
fs.rmSync(releaseDir, { recursive: true, force: true });
process.stdout.write(`release/: очищен ${releaseDir}\n`);
