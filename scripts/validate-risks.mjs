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

const PLACEHOLDER = /\b(TODO|TBD|FIXME)\b/;
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;
const TASK_ID = /(^|[\s(])t-[a-z0-9-]+/;
const SUPERSEDES = /см\.\s*(R-\d+)/i;
const ID_ROW = /^\|\s*(R-\d+)\s*\|/;

function cellsOf(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function isTableRow(line) {
  return line.trim().startsWith('|');
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
    .filter((row) => isTableRow(row.text) && /^\|\s*R-\d+\s*\|/.test(row.text))
    .map((row) => ({ line: row.line, cells: cellsOf(row.text) }));

  return { found: true, headerOk, rows, headerCells };
}

function collectIds(markdown) {
  const ids = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(ID_ROW);
    if (match) ids.push(match[1]);
  }
  return ids;
}

function validateRow(cells, line, ids) {
  const errors = [];
  const at = (message) => ({ code: message.code, message: `строка ${line}: ${message.message}` });

  if (cells.length !== REQUIRED_COLUMNS.length) {
    return [at({ code: 'RISK_ROW_COLUMNS', message: `ожидалось ${REQUIRED_COLUMNS.length} колонок, получено ${cells.length}` })];
  }

  const [id, date, task, risk, impact, options, decision, decider, trigger, status] = cells;
  const joined = cells.join(' | ');

  if (PLACEHOLDER.test(joined)) {
    errors.push(at({ code: 'RISK_PLACEHOLDER', message: 'заглушка TODO/TBD/FIXME вместо решения' }));
  }
  if (!ISO_DATE.test(date)) {
    errors.push(at({ code: 'RISK_DATE_INVALID', message: `дата «${date}» не в формате YYYY-MM-DD` }));
  }
  if (task !== 'до разработки' && !TASK_ID.test(task)) {
    errors.push(at({ code: 'RISK_TASK_INVALID', message: `задача «${task}» не t-… и не «до разработки»` }));
  }
  if (risk.length < 20) {
    errors.push(at({ code: 'RISK_RISK_TOO_SHORT', message: 'риск сформулирован короче 20 символов' }));
  }
  if (impact.length < 10) {
    errors.push(at({ code: 'RISK_IMPACT_TOO_SHORT', message: 'влияние описано короче 10 символов' }));
  }
  if (options === '') {
    errors.push(at({ code: 'RISK_FIELD_EMPTY', message: 'не перечислены варианты решения' }));
  }
  if (decision === '') {
    errors.push(at({ code: 'RISK_DECISION_MISSING', message: 'нет решения пользователя' }));
  }
  if (!ISO_DATE.test(decider)) {
    errors.push(at({ code: 'RISK_DECIDER_INVALID', message: 'не указано, кто и когда решил (нет даты)' }));
  }
  if (!STATUSES.includes(status)) {
    errors.push(at({ code: 'RISK_STATUS_INVALID', message: `статус «${status}» не из ${STATUSES.join('/')}` }));
  }
  if (status === 'отложено' && trigger === '') {
    errors.push(at({ code: 'RISK_TRIGGER_MISSING', message: '«отложено» без триггера пересмотра' }));
  }
  const superseded = decision.match(SUPERSEDES);
  if (superseded && !ids.includes(superseded[1])) {
    errors.push(at({ code: 'RISK_SUPERSEDES_UNKNOWN', message: `ссылка на несуществующий ${superseded[1]}` }));
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
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push({ code: 'RISK_ID_DUPLICATE', message: `ID ${id} встречается больше одного раза` });
    }
    seen.add(id);
  }

  const numbers = [...seen].map((id) => Number(id.slice(2))).sort((a, b) => a - b);
  if (numbers.length > 0) {
    const missing = [];
    for (let number = 1; number <= numbers[numbers.length - 1]; number += 1) {
      if (!numbers.includes(number)) missing.push(`R-${String(number).padStart(2, '0')}`);
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
