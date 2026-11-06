import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('AGENTS.md содержит шлюз остаточных рисков', () => {
  const md = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.match(md, /^## 6\. Остаточные риски и решения пользователя/m);
  assert.match(md, /waitingForHuman=true/);
  assert.match(md, /«[Оо]тложить»[\s\S]{0,20}тоже решение/);
  assert.match(md, /risks\.md/);
  assert.match(md, /in_review/);
  assert.match(md, /ask_user_question/);
  assert.match(md, /Молчаливое принятие запрещено/);
  assert.match(md, /остаточных рисков нет/);
});

// ---------------------------------------------------------------------------
// Ужесточение после ревью: заглушки, отложенные решения, ID, CLI
// ---------------------------------------------------------------------------

test('прочерк и n/a вместо решения — ошибка', () => {
  for (const value of ['—', '-', 'n/a', 'N/A', 'н/д']) {
    const errors = validateRisks(doc(ROW.replace('Выбран вариант 1', value)));
    assert.ok(
      errors.some((e) => e.code === 'RISK_DECISION_MISSING' || e.code === 'RISK_PLACEHOLDER'),
      `значение «${value}» должно считаться отсутствием решения`,
    );
  }
});

test('нижний регистр todo — заглушка', () => {
  const errors = validateRisks(doc(ROW.replace('Выбран вариант 1', 'todo')));
  assert.ok(errors.some((e) => e.code === 'RISK_PLACEHOLDER'));
});

test('отложено с прочерком в триггере — ошибка', () => {
  const row = ROW.replace('| принято |', '| отложено |').replace('| три итерации с пропусками |', '| — |');
  const errors = validateRisks(doc(row));
  assert.ok(errors.some((e) => e.code === 'RISK_TRIGGER_MISSING'));
});

test('решение «Отложить…» при статусе принято требует триггер', () => {
  const row = ROW.replace('Выбран вариант 1', 'Отложить до следующей итерации').replace('| три итерации с пропусками |', '|  |');
  const errors = validateRisks(doc(row));
  assert.ok(errors.some((e) => e.code === 'RISK_TRIGGER_MISSING'));
});

test('неканонический ID — ошибка', () => {
  for (const id of ['R-1', 'R_11', '**R-11**']) {
    const errors = validateRisks(doc(ROW.replace('| R-11 |', `| ${id} |`)));
    assert.ok(errors.some((e) => e.code === 'RISK_ID_FORMAT'), `ID ${id} должен отклоняться`);
  }
});

test('R-1 и R-01 — дубликат по числу', () => {
  const errors = validateRisks(doc(ROW.replace('| R-11 |', '| R-1 |')));
  assert.ok(errors.some((e) => e.code === 'RISK_ID_DUPLICATE'));
});

test('нереальная дата — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('2026-11-06', '2026-13-99')));
  assert.ok(errors.some((e) => e.code === 'RISK_DATE_INVALID'));
});

test('неверная шапка таблицы — ошибка', () => {
  const broken = doc().replace('| Статус |', '| Состояние |');
  const errors = validateRisks(broken);
  assert.ok(errors.some((e) => e.code === 'RISK_HEADER_INVALID'));
});

test('неверное число колонок — ошибка', () => {
  const errors = validateRisks(doc(`${ROW} |`));
  assert.ok(errors.some((e) => e.code === 'RISK_ROW_COLUMNS'));
});

test('неверная задача — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('t-mw54ckf7-pxafp0', 'задача')));
  assert.ok(errors.some((e) => e.code === 'RISK_TASK_INVALID'));
});

test('слишком короткий риск — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('Правило может стать формальностью', 'риск')));
  assert.ok(errors.some((e) => e.code === 'RISK_RISK_TOO_SHORT'));
});

test('слишком короткое влияние — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('Риски снова теряются', 'плохо')));
  assert.ok(errors.some((e) => e.code === 'RISK_IMPACT_TOO_SHORT'));
});

test('решатель без даты — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('пользователь, 2026-11-06', 'пользователь')));
  assert.ok(errors.some((e) => e.code === 'RISK_DECIDER_INVALID'));
});

test('пустые варианты — ошибка', () => {
  const errors = validateRisks(doc(ROW.replace('1) правило и проверка; 2) гейт в плагине', '')));
  assert.ok(errors.some((e) => e.code === 'RISK_FIELD_EMPTY'));
});

test('pnpm validate включает проверку журнала', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.validate, /validate-risks\.mjs/);
});

test('CLI: валидный файл — exit 0; риск без решения — exit 1; нет файла — exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'risks-'));
  try {
    const valid = join(dir, 'valid.md');
    const invalid = join(dir, 'invalid.md');
    writeFileSync(valid, doc(ROW));
    writeFileSync(invalid, doc(ROW.replace('| Выбран вариант 1 |', '|  |')));
    const script = fileURLToPath(new URL('../scripts/validate-risks.mjs', import.meta.url));

    const ok = spawnSync(process.execPath, [script, valid, '--json'], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).ok, true);

    const bad = spawnSync(process.execPath, [script, invalid, '--json'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).ok, false);

    const missing = spawnSync(process.execPath, [script, join(dir, 'nope.md')], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
