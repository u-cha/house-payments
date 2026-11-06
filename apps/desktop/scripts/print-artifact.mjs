// ADR-0019: после сборки печатаем путь и ссылку на артефакт. Сдача итерации
// должна содержать ссылку, а не вопрос «какая сборка свежая».
//
// Имя артефакта не дублируется: единственный источник — dmg.artifactName в
// electron-builder.yml. Тест tests/artifact-path.test.mjs сверяет его с
// документацией (README, AGENTS.md, roadmap, ADR-0019).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARTIFACT_CONFIG = 'apps/desktop/electron-builder.yml';

/** Имя файла артефакта из конфигурации сборки, с подставленным расширением. */
export function artifactName(configText) {
  const match = configText.match(/^\s*artifactName:\s*(\S+)\s*$/m);
  if (!match) throw new Error(`в ${ARTIFACT_CONFIG} нет поля artifactName`);
  return match[1].replace(/\$\{ext\}/g, 'dmg');
}

/** Абсолютный путь к артефакту в единственном каталоге release/ (ADR-0018). */
export function artifactPath(repoRoot) {
  const configPath = path.join(repoRoot, ARTIFACT_CONFIG);
  const name = artifactName(fs.readFileSync(configPath, 'utf8'));
  return path.join(repoRoot, 'release', name);
}

/** Ссылка для отчёта по задаче: относительный путь от корня репозитория. */
export function artifactLink(repoRoot) {
  return path.relative(repoRoot, artifactPath(repoRoot)).split(path.sep).join('/');
}

function main() {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const file = artifactPath(repoRoot);
  if (!fs.existsSync(file)) {
    throw new Error(`артефакт не найден: ${file} — сборка не завершилась?`);
  }
  const bytes = fs.statSync(file).size;
  process.stdout.write(`Артефакт: ${file}\n`);
  process.stdout.write(`Ссылка: ${artifactLink(repoRoot)}\n`);
  process.stdout.write(`Размер: ${(bytes / 1024 / 1024).toFixed(1)} МиБ\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
