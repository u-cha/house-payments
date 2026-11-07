#!/usr/bin/env node
/**
 * validate-risks.mjs — проверка журнала решений по остаточным рискам.
 *
 * Решение по остаточному риску — такой же проверяемый артефакт, как ADR или
 * инвариант: `pnpm validate` падает, если в журнале есть риск без решения,
 * «отложено» без триггера пересмотра, дубль или разрыв ID, либо заглушка
 * TODO/TBD. Подробности правила — ADR-0021 и AGENTS.md §6.
 *
 * CLI: node scripts/validate-risks.mjs [file] [--json]
 * Тесты: node --test tests/risks.test.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Заголовок раздела журнала в docs/design/risks.md. */
export const SECTION_HEADING = '## 8. Риски итераций и решения';

/** Колонки журнала в порядке следования. */
export const REQUIRED_COLUMNS = [
  'ID',
  'Дата',
  'Задача',
  'Риск (простым языком)',
  'Влияние',
  'Варианты',
  'Решение',
  'Кто и когда решил',
  'Триггер пересмотра',
  'Статус',
];

/** Допустимые статусы решения. */
export const STATUSES = ['принято', 'исправлено', 'отложено', 'закрыто', 'пересмотрено'];

const PLACEHOLDER = /\b(TODO|TBD|FIXME|N\/A|Н\/Д)\b/i;
const DASH_ONLY = /^[—–-]+$/;
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;
const TASK_ID = /(^|[\s(])t-[a-z0-9-]+/;
const SUPERSEDES = /см\.\s*(R-\d+)/i;
const ID_LIKE = /^R[_\-\s]*(\d+)$/i;

function cellsOf(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function isTableRow(line) {
  return line.trim().startsWith('|');
}

/** «Пустое» значение: пусто, прочерк или n/a. */
function isBlank(value) {
  return value === '' || DASH_ONLY.test(value) || /^(n\/a|н\/д)$/i.test(value);
}

/** Реальная календарная дата в формате YYYY-MM-DD (не только форма). */
function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Убирает markdown-выделение из ячейки ID, чтобы поймать `**R-11**`. */
function normalizedIdCell(cell) {
  return cell.replace(/\*/g, '').trim();
}

/**
 * Выделяет раздел §8 и строки журнала.
 * @param {string} markdown
 * @returns {{ found: boolean, headerOk: boolean, rows: Array<{ line: number, cells: string[] }> }}
 */
export function parseRiskSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === SECTION_HEADING);
  if (start === -1) return { found: false, headerOk: false, rows: [] };

  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    section.push({ text: lines[index], line: index + 1 });
  }

  const header = section.find((row) => isTableRow(row.text) && cellsOf(row.text).includes('ID'));
  const headerCells = header ? cellsOf(header.text) : [];
  const headerOk =
    headerCells.length === REQUIRED_COLUMNS.length &&
    REQUIRED_COLUMNS.every((column, index) => headerCells[index] === column);

  const rows = section
    .filter((row) => isTableRow(row.text) && ID_LIKE.test(normalizedIdCell(cellsOf(row.text)[0] ?? '')))
    .map((row) => ({ line: row.line, cells: cellsOf(row.text) }));

  return { found: true, headerOk, rows };
}

/** Все ID журнала в документе: строка + номер (для сквозной проверки). */
function collectIds(markdown) {
  const ids = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!isTableRow(line)) continue;
    const raw = normalizedIdCell(cellsOf(line)[0] ?? '');
    const match = raw.match(ID_LIKE);
    if (match) ids.push({ raw, number: Number(match[1]) });
  }
  return ids;
}

function canonicalId(number) {
  return `R-${String(number).padStart(2, '0')}`;
}

function validateRow(cells, line, ids) {
  const errors = [];
  const at = (code, message) => ({ code, message: `строка ${line}: ${message}` });

  if (cells.length !== REQUIRED_COLUMNS.length) {
    return [at('RISK_ROW_COLUMNS', `ожидалось ${REQUIRED_COLUMNS.length} колонок, получено ${cells.length}`)];
  }

  const [id, date, task, risk, impact, options, decision, decider, trigger, status] = cells;
  const joined = cells.join(' | ');
  const number = Number(normalizedIdCell(id).match(/\d+/)?.[0]);

  if (id.trim() !== canonicalId(number)) {
    errors.push(at('RISK_ID_FORMAT', `ID «${id}» должен быть ${canonicalId(number)}`));
  }
  if (PLACEHOLDER.test(joined)) {
    errors.push(at('RISK_PLACEHOLDER', 'заглушка вместо решения'));
  }
  if (!isValidIsoDate(date)) {
    errors.push(at('RISK_DATE_INVALID', `дата «${date}» не в формате YYYY-MM-DD`));
  }
  if (task !== 'до разработки' && !TASK_ID.test(task)) {
    errors.push(at('RISK_TASK_INVALID', `задача «${task}» не t-… и не «до разработки»`));
  }
  if (risk.length < 20) {
    errors.push(at('RISK_RISK_TOO_SHORT', 'риск сформулирован короче 20 символов'));
  }
  if (impact.length < 10) {
    errors.push(at('RISK_IMPACT_TOO_SHORT', 'влияние описано короче 10 символов'));
  }
  if (isBlank(options)) {
    errors.push(at('RISK_FIELD_EMPTY', 'не перечислены варианты решения'));
  }
  if (isBlank(decision)) {
    errors.push(at('RISK_DECISION_MISSING', 'нет решения пользователя'));
  }
  const decidedOn = decider.match(ISO_DATE);
  if (!decidedOn || !isValidIsoDate(decidedOn[1])) {
    errors.push(at('RISK_DECIDER_INVALID', 'не указано, кто и когда решил (нет реальной даты)'));
  }
  if (!STATUSES.includes(status)) {
    errors.push(at('RISK_STATUS_INVALID', `статус «${status}» не из ${STATUSES.join('/')}`));
  }
  // «Отложено» — решение, но только с триггером: статус или текст решения.
  if (isBlank(trigger) && (status === 'отложено' || /отлож/i.test(decision))) {
    errors.push(at('RISK_TRIGGER_MISSING', '«отложено» без триггера пересмотра'));
  }
  const superseded = decision.match(SUPERSEDES);
  if (superseded && !ids.some((entry) => entry.raw === superseded[1])) {
    errors.push(at('RISK_SUPERSEDES_UNKNOWN', `ссылка на несуществующий ${superseded[1]}`));
  }
  return errors;
}

/**
 * Проверяет весь журнал.
 * @param {string} markdown
 * @returns {Array<{ code: string, message: string }>}
 */
export function validateRisks(markdown) {
  const { found, headerOk, rows } = parseRiskSection(markdown);
  if (!found) {
    return [{ code: 'RISK_SECTION_MISSING', message: `нет раздела «${SECTION_HEADING}»` }];
  }

  const errors = [];
  if (!headerOk) {
    errors.push({
      code: 'RISK_HEADER_INVALID',
      message: `шапка таблицы должна быть: ${REQUIRED_COLUMNS.join(' | ')}`,
    });
  }

  const ids = collectIds(markdown);
  const byNumber = new Map();
  for (const entry of ids) {
    byNumber.set(entry.number, [...(byNumber.get(entry.number) ?? []), entry.raw]);
    if (entry.raw !== canonicalId(entry.number)) {
      errors.push({
        code: 'RISK_ID_FORMAT',
        message: `ID «${entry.raw}» должен быть ${canonicalId(entry.number)}`,
      });
    }
  }
  for (const [number, raw] of byNumber) {
    if (raw.length > 1) {
      errors.push({
        code: 'RISK_ID_DUPLICATE',
        message: `номер R-${String(number).padStart(2, '0')} встречается ${raw.length} раза (${raw.join(', ')})`,
      });
    }
  }

  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  if (numbers.length > 0) {
    const missing = [];
    for (let number = 1; number <= numbers[numbers.length - 1]; number += 1) {
      if (!byNumber.has(number)) missing.push(canonicalId(number));
    }
    if (missing.length > 0) {
      errors.push({ code: 'RISK_ID_GAP', message: `в нумерации нет: ${missing.join(', ')}` });
    }
  }

  for (const row of rows) {
    errors.push(...validateRow(row.cells, row.line, ids));
  }

  return errors;
}

/** Человекочитаемый отчёт. */
export function formatRisksReport(errors) {
  if (errors.length === 0) return 'Журнал рисков: ошибок нет.';
  return [
    `Журнал рисков: ${errors.length} ошибок.`,
    ...errors.map((error) => `  ${error.code}: ${error.message}`),
  ].join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const file = argv.find((arg) => !arg.startsWith('--')) ?? 'docs/design/risks.md';
  let errors;
  try {
    errors = validateRisks(readFileSync(resolve(file), 'utf8'));
  } catch (error) {
    console.error(`validate-risks: не удалось прочитать ${file}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (json) {
    console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
  } else {
    console.log(formatRisksReport(errors));
  }
  if (errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
