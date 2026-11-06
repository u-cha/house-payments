import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SECTION_HEADING,
  validateRisks,
  parseRiskSection,
} from '../scripts/validate-risks.mjs';

// Раздел §2 уже содержит R-01…R-10; журнал §8 продолжает нумерацию.
const PRIOR = `## 2. Реестр рисков

| ID | Риск | Решение |
|---|---|---|
${Array.from({ length: 10 }, (_, i) => `| R-${String(i + 1).padStart(2, '0')} | риск ${i + 1} | решение ${i + 1} |`).join('\n')}
`;

const HEADER = `${SECTION_HEADING}

| ID | Дата | Задача | Риск (простым языком) | Влияние | Варианты | Решение | Кто и когда решил | Триггер пересмотра | Статус |
|---|---|---|---|---|---|---|---|---|---|
`;

const ROW =
  '| R-11 | 2026-11-06 | t-mw54ckf7-pxafp0 | Правило может стать формальностью | Риски снова теряются | 1) правило и проверка; 2) гейт в плагине | Выбран вариант 1 | пользователь, 2026-11-06 | три итерации с пропусками | принято |';

const doc = (...rows) => `${PRIOR}${HEADER}${rows.join('\n')}\n`;

test('валидный журнал не даёт ошибок', () => {
  assert.deepEqual(validateRisks(doc(ROW)), []);
});

test('отсутствующий раздел — ошибка', () => {
  const errors = validateRisks('# Реестр\n');
  assert.ok(errors.some((e) => e.code === 'RISK_SECTION_MISSING'));
});

test('разбор строк: заголовок и ячейки', () => {
  const parsed = parseRiskSection(doc(ROW));
  assert.equal(parsed.found, true);
  assert.equal(parsed.headerOk, true);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].cells[0], 'R-11');
});

test('пустое решение — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('| Выбран вариант 1 |', '|  |')));
  assert.ok(errors.some((e) => e.code === 'RISK_DECISION_MISSING'));
});

test('отложено без триггера — ошибка', () => {
  const row = ROW.replace('| принято |', '| отложено |').replace('| три итерации с пропусками |', '|  |');
  const errors = validateRisks(doc(row));
  assert.ok(errors.some((e) => e.code === 'RISK_TRIGGER_MISSING'));
});

test('недопустимый статус — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('| принято |', '| как-нибудь |')));
  assert.ok(errors.some((e) => e.code === 'RISK_STATUS_INVALID'));
});

test('заглушка в решении — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('Выбран вариант 1', 'TODO')));
  assert.ok(errors.some((e) => e.code === 'RISK_PLACEHOLDER'));
});

test('дубликат ID — ошибка', () => {
  const errors = validateRisks(doc(ROW, ROW));
  assert.ok(errors.some((e) => e.code === 'RISK_ID_DUPLICATE'));
});

test('разрыв нумерации — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('R-11', 'R-13')));
  assert.ok(errors.some((e) => e.code === 'RISK_ID_GAP'));
});

test('битая ссылка «см. R-NN» — ошибка', () => {
  const row = ROW.replace('Выбран вариант 1', 'см. R-99');
  const errors = validateRisks(doc(row));
  assert.ok(errors.some((e) => e.code === 'RISK_SUPERSEDES_UNKNOWN'));
});

test('реальный risks.md проходит проверку', () => {
  const md = readFileSync(new URL('../docs/design/risks.md', import.meta.url), 'utf8');
  assert.deepEqual(validateRisks(md), []);
});
