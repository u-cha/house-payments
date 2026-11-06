# Residual Risk Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать решение пользователя по каждому остаточному риску обязательным и проверяемым: правило в AGENTS.md, журнал решений в risks.md и валидатор в `pnpm check`.

**Architecture:** Три слоя одного шлюза. Текст правила в `AGENTS.md` заставляет агента объяснить риск, задать вопрос и записать решение. Журнал `docs/design/risks.md` §8 хранит решения в репозитории. `scripts/validate-risks.mjs`, включённый в `pnpm validate`, валит сборку, если риск записан без решения, «отложено» без триггера или ID нарушает нумерацию.

**Tech Stack:** Node.js ≥ 22, ESM, `node:test` + `node:assert/strict`, markdown-разбор регулярными выражениями, pnpm-скрипты.

**Spec:** `docs/design/architecture/adr/0021-residual-risk-decisions.md` (одобрен пользователем 2026-11-06).

## Global Constraints

- Русский язык правил, комментариев в коде и сообщений валидатора.
- `pnpm check` обязателен и должен быть зелёным до сдачи.
- Ветка: `docs/t-mw54ckf7-pxafp0-residual-risk-gate` от свежего `origin/main`.
- Conventional Commits, в теле — строка `Task: t-mw54ckf7-pxafp0`.
- Новые markdown-ссылки должны вести на существующие файлы (`validate-docs`).
- Никаких секретов, абсолютных путей и артефактов сборки в коммите.
- Решение R-01…R-10 не переписывается; журнал §8 только дополняется.

## Review Focus

- Строка журнала с пустым решением: пользователь не выбрал, а риск выглядит закрытым → `RISK_DECISION_MISSING`.
- «Отложено» без триггера пересмотра: риск исчезает из поля зрения навсегда → `RISK_TRIGGER_MISSING`.
- Дубликат или разрыв ID: две разные записи сливаются, история теряется → `RISK_ID_DUPLICATE` / `RISK_ID_GAP`.
- Строка с `TODO`/`TBD` вместо решения проходит незамеченной → `RISK_PLACEHOLDER`.
- Правило удалено или переписано без правки тестов, и шлюз тихо исчезает → тест `tests/risks.test.mjs` на содержимое `AGENTS.md`.

---

### Task 1: Журнал рисков итераций + валидатор

**Files:**
- Create: `scripts/validate-risks.mjs`
- Create: `tests/risks.test.mjs`
- Modify: `docs/design/risks.md` (append §8)
- Modify: `package.json` (`validate`)

**Interfaces:**
- Produces: `validateRisks(markdown: string): Array<{ code: string, message: string }>`
- Produces: `formatRisksReport(errors): string`
- Produces: `parseRiskSection(markdown): { found: boolean, headerOk: boolean, rows: Array<{ line: number, cells: string[] }> }`
- Produces: константы `SECTION_HEADING`, `STATUSES`, `REQUIRED_COLUMNS`.
- CLI: `node scripts/validate-risks.mjs [file]` → exit 0/1, `--json` печатает `{ ok, errors }`.

- [ ] **Step 1: Написать падающие тесты**

`tests/risks.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SECTION_HEADING,
  validateRisks,
  parseRiskSection,
} from '../scripts/validate-risks.mjs';

const HEADER = `${SECTION_HEADING}

| ID | Дата | Задача | Риск (простым языком) | Влияние | Варианты | Решение | Кто и когда решил | Триггер пересмотра | Статус |
|---|---|---|---|---|---|---|---|---|---|
`;

const ROW =
  '| R-11 | 2026-11-06 | t-mw54ckf7-pxafp0 | Правило может стать формальностью | Риски снова теряются | 1) правило и проверка; 2) гейт в плагине | Выбран вариант 1 | пользователь, 2026-11-06 | три итерации с пропусками | принято |';

const doc = (...rows) => `${HEADER}${rows.join('\n')}\n`;

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
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test tests/risks.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/validate-risks.mjs'`.

- [ ] **Step 3: Реализовать `scripts/validate-risks.mjs`**

Контракт:

```js
export const SECTION_HEADING = '## 8. Риски итераций и решения';
export const REQUIRED_COLUMNS = ['ID', 'Дата', 'Задача', 'Риск (простым языком)', 'Влияние', 'Варианты', 'Решение', 'Кто и когда решил', 'Триггер пересмотра', 'Статус'];
export const STATUSES = ['принято', 'исправлено', 'отложено', 'закрыто', 'пересмотрено'];
export function parseRiskSection(markdown) {}
export function validateRisks(markdown) {}
export function formatRisksReport(errors) {}
```

Правила проверки (каждая ошибка — `{ code, message }`):
- раздел `## 8. Риски итераций и решения` найден, после него есть таблица с `REQUIRED_COLUMNS` (`RISK_SECTION_MISSING`, `RISK_HEADER_INVALID`);
- каждая строка `| R-…` в §8 содержит 10 непустых ячеек (`RISK_ROW_COLUMNS`, `RISK_FIELD_EMPTY`);
- ID уникален по всему файлу, числовой ряд 01…N без разрывов (`RISK_ID_DUPLICATE`, `RISK_ID_GAP`);
- дата ISO `YYYY-MM-DD` (`RISK_DATE_INVALID`);
- задача — `t-[a-z0-9-]+` или `до разработки` (`RISK_TASK_INVALID`);
- риск ≥ 20 символов, влияние ≥ 10 (`RISK_RISK_TOO_SHORT`, `RISK_IMPACT_TOO_SHORT`);
- статус из `STATUSES` (`RISK_STATUS_INVALID`);
- «Кто и когда решил» содержит ISO-дату (`RISK_DECIDER_INVALID`);
- `отложено` требует непустой триггер (`RISK_TRIGGER_MISSING`);
- «см. R-NN» ссылается на существующий ID (`RISK_SUPERSEDES_UNKNOWN`);
- нет `TODO`, `TBD`, `FIXME` (`RISK_PLACEHOLDER`);
- CLI читает `docs/design/risks.md` (или аргумент), печатает ошибки и выходит 1.

- [ ] **Step 4: Добавить §8 в `docs/design/risks.md` и первую строку R-11**

В конец файла — раздел с пояснением (только дополняется, «отложено» = решение с триггером, проверка `pnpm validate`) и таблицей `REQUIRED_COLUMNS`, затем строка R-11:

```
| R-11 | 2026-11-06 | t-mw54ckf7-pxafp0 | Правило может превратиться в формальность: агент пишет «принято» без обсуждения, и журнал перестаёт защищать | Риски снова теряются, решение не принимается | 1) правило и журнал с проверкой; 2) жёсткий гейт в плагине доски; 3) оставить как есть | Выбран вариант 1; пересмотр по триггеру | пользователь, 2026-11-06 | три итерации подряд с рисками без решения — перейти к варианту 2 | принято |
```

- [ ] **Step 5: Подключить проверку в `package.json`**

`"validate": "node scripts/validate-docs.mjs && node scripts/validate-risks.mjs"`.

- [ ] **Step 6: Прогнать тесты и проверку**

Run: `node --test tests/risks.test.mjs && node scripts/validate-risks.mjs`
Expected: PASS, exit 0.

- [ ] **Step 7: Коммит**

```bash
git add scripts/validate-risks.mjs tests/risks.test.mjs docs/design/risks.md package.json
git commit -m "feat: журнал остаточных рисков и проверка решений

Риски итераций жили только в комментариях карточек; добавлен
версионируемый журнал решений и проверка в pnpm validate.

Task: t-mw54ckf7-pxafp0"
```

### Task 2: Правило в AGENTS.md

**Files:**
- Modify: `AGENTS.md` (§3.6, §5, новый §6)
- Modify: `tests/risks.test.mjs` (тест на правило)

**Interfaces:**
- Consumes: `SECTION_HEADING` из Task 1 (в тесте только тексты).

- [ ] **Step 1: Написать падающий тест правила**

Добавить в `tests/risks.test.mjs`:

```js
test('AGENTS.md содержит шлюз остаточных рисков', () => {
  const md = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.match(md, /^## 6\. Остаточные риски и решения пользователя/m);
  assert.match(md, /waitingForHuman=true/);
  assert.match(md, /«отложить» — тоже решение/);
  assert.match(md, /risks\.md/);
  assert.match(md, /остаточных рисков нет/);
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/risks.test.mjs`
Expected: FAIL на `assert.match`.

- [ ] **Step 3: Дописать §6 и правки §3.6/§5**

§3.6: «описание — что/зачем/как проверено/остаточные риски **и принятые по ним решения (ссылки на строки `docs/design/risks.md`)**».

§5: пункт про отчёт дополнить «решения по остаточным рискам (или явное «остаточных рисков нет») со ссылками на строки журнала».

§6 — текст:

```markdown
## 6. Остаточные риски и решения пользователя

Остаточный риск — то, с чем пользователь будет жить после изменения: ручной шаг,
отложенная работа, внешняя зависимость, необратимый выбор, известное
ограничение. Техническая деталь, не меняющая поведение пользователя и не
требующая выбора, риском не считается.

Любая сессия или задача, которая меняет репозиторий, до перевода карточки в
`in_review` (в интерактивной сессии — до финального ответа) обязана:

1. Перечислить остаточные риски простым языком: что случится с пользователем,
   при каких условиях и чем это грозит. Если рисков нет — явно написать
   «остаточных рисков нет» и почему.
2. По каждому риску, где есть выбор, задать пользователю один вопрос с 2–3
   вариантами и рекомендацией: `ask_user_question` в интерактивной сессии; в
   исполнении доски — `waitingForHuman=true` с причиной, карточка остаётся
   `in_progress` и не переводится в `in_review` до решения.
3. Записать решение в `docs/design/risks.md` §8 «Риски итераций и решения» и в
   комментарий карточки разделом «Решения по остаточным рискам». «Отложить» —
   тоже решение, с триггером пересмотра; если отложенная работа нужна — отдельная
   карточка.
4. Не считать риск принятым без записи решения. Молчаливое принятие запрещено.

Пользователь — источник истины. Агент не решает за пользователя риск, если есть
выбор; решение «отложить» допустимо только явно. `done` ставит только
пользователь, и для карточки с рисками это означает, что решения приняты.
Создаваемые агентом карточки получают DoD-пункт «Остаточные риски вынесены на
решение пользователя». Проверка журнала — `pnpm check` (`validate-risks`).
```

- [ ] **Step 4: Прогнать тест**

Run: `node --test tests/risks.test.mjs`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add AGENTS.md tests/risks.test.mjs
git commit -m "docs: шлюз остаточных рисков в правилах работы

Правило требует объяснить риск, задать вопрос и записать решение
до приёмки; отложенное решение фиксируется с триггером.

Task: t-mw54ckf7-pxafp0"
```

### Task 3: Индекс ADR и навигация

**Files:**
- Modify: `docs/design/architecture/adr/README.md` (индекс)
- Modify: `docs/design/README.md` (карта, диапазон ADR)
- Modify: `docs/design/architecture/README.md` (fitness functions)

- [ ] **Step 1: Добавить ADR-0021 в индекс**

Строка в §1: `| [0021](0021-residual-risk-decisions.md) | Остаточные риски — обязательное решение пользователя | proposed | 2026-11-06 | — |`.

- [ ] **Step 2: Обновить карту артефактов**

`docs/design/README.md`: `risks.md` — «R-01…R-10, журнал рисков итераций §8»; `adr/` — «ADR-0001…0021».

- [ ] **Step 3: Добавить fitness function**

В таблицу проверок `docs/design/architecture/README.md`: «Риск в журнале без решения не проходит проверку» | `tests/risks.test.mjs`, `scripts/validate-risks.mjs` | `pnpm validate`.

- [ ] **Step 4: Проверить ссылки и индекс**

Run: `node scripts/validate-docs.mjs`
Expected: PASS (ADR в индексе, все markdown-ссылки живые).

- [ ] **Step 5: Коммит**

```bash
git add docs/design/architecture/adr/README.md docs/design/README.md docs/design/architecture/README.md
git commit -m "docs: ADR-0021 в индексе и навигации

Task: t-mw54ckf7-pxafp0"
```

### Task 4: Полная проверка и сдача

**Files:**
- Modify: нет (если `pnpm check` не выявит пропусков).

- [ ] **Step 1: Прогнать полный `pnpm check`**

Run: `pnpm check`
Expected: `validate`, `arch`, unit и e2e — зелёные.

- [ ] **Step 2: Проверить, что правило срабатывает на сломанном журнале**

Временно испортить строку R-11 (пустое решение) → `node scripts/validate-risks.mjs` → exit 1 с `RISK_DECISION_MISSING`; вернуть строку.

- [ ] **Step 3: Коммит (если есть правки) и пуш**

```bash
pnpm sync:main
pnpm check
git push -u origin docs/t-mw54ckf7-pxafp0-residual-risk-gate
```

- [ ] **Step 4: PR и CI**

Создать PR в `main` (заголовок `docs: …`, описание что/зачем/как проверено/остаточные риски и решения), дождаться зелёного `pnpm ci:status --wait`.

- [ ] **Step 5: Сдача карточки**

`taskboard_execution_report` (summary/changedFiles/checks/risk), `taskboard_comment_add` с разделом «Решения по остаточным рискам», `taskboard_move` → `in_review`. В отчёте — ссылка на `release/house-payments-mac-arm64-latest.dmg` не требуется: код приложения не меняется (ADR-0019), но указать это явно.
