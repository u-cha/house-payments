/* global process */
// ADR-0019: после сборки печатаем путь и ссылку на артефакт. Сдача итерации
// должна содержать ссылку, а не вопрос «какая сборка свежая».
//
// Имена артефактов не дублируются: единственный источник — artifactName в
// electron-builder.yml. Тест tests/artifact-path.test.mjs сверяет их с
// документацией (README, AGENTS.md, roadmap, ADR-0019/ADR-0022).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARTIFACT_CONFIG = 'apps/desktop/electron-builder.yml';

/** Платформа → раздел конфигурации с artifactName и расширение файла. */
export const PLATFORMS = {
  mac: { section: 'dmg', ext: 'dmg', title: 'macOS' },
  win: { section: 'win', ext: 'exe', title: 'Windows' },
  linux: { section: 'linux', ext: 'AppImage', title: 'Linux' },
};

export const DEFAULT_PLATFORM = 'mac';

/** Тело раздела верхнего уровня из YAML (до следующего ключа без отступа). */
function sectionBody(configText, section) {
  const lines = configText.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${section}:\\s*$`).test(line));
  if (start === -1) return '';
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z]/.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

/** Имя файла артефакта платформы из конфигурации сборки. */
export function artifactName(configText, platform = DEFAULT_PLATFORM) {
  const target = PLATFORMS[platform];
  if (!target) throw new Error(`неизвестная платформа: ${platform}`);
  const match = sectionBody(configText, target.section).match(/^\s*artifactName:\s*(\S+)\s*$/m);
  if (!match) throw new Error(`в ${ARTIFACT_CONFIG} нет artifactName для ${platform}`);
  return match[1].replace(/\$\{ext\}/g, target.ext);
}

/** Все имена артефактов: платформа → имя файла. */
export function artifactNames(configText) {
  return Object.fromEntries(
    Object.keys(PLATFORMS).map((platform) => [platform, artifactName(configText, platform)]),
  );
}

/** Абсолютный путь к артефакту в единственном каталоге release/ (ADR-0018). */
export function artifactPath(repoRoot, platform = DEFAULT_PLATFORM) {
  const configPath = path.join(repoRoot, ARTIFACT_CONFIG);
  const name = artifactName(fs.readFileSync(configPath, 'utf8'), platform);
  return path.join(repoRoot, 'release', name);
}

/** Ссылка для отчёта по задаче: относительный путь от корня репозитория. */
export function artifactLink(repoRoot, platform = DEFAULT_PLATFORM) {
  return path.relative(repoRoot, artifactPath(repoRoot, platform)).split(path.sep).join('/');
}

function parsePlatform(argv) {
  const index = argv.indexOf('--platform');
  if (index === -1) return DEFAULT_PLATFORM;
  const platform = argv[index + 1];
  if (!PLATFORMS[platform]) throw new Error(`неизвестная платформа: ${platform}`);
  return platform;
}

function main() {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const platform = parsePlatform(process.argv.slice(2));
  const file = artifactPath(repoRoot, platform);
  if (!fs.existsSync(file)) {
    throw new Error(`артефакт не найден: ${file} — сборка не завершилась?`);
  }
  const bytes = fs.statSync(file).size;
  process.stdout.write(`Платформа: ${PLATFORMS[platform].title}\n`);
  process.stdout.write(`Артефакт: ${file}\n`);
  process.stdout.write(`Ссылка: ${artifactLink(repoRoot, platform)}\n`);
  process.stdout.write(`Размер: ${(bytes / 1024 / 1024).toFixed(1)} МиБ\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
