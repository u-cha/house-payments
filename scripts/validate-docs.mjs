#!/usr/bin/env node
/**
 * validate-docs.mjs — исполняемые проверки проектных артефактов.
 *
 * Репозиторий содержит только текст: .md/.mmd/.dbml. Поэтому «тесты» здесь —
 * fitness functions: они удерживают свойства, ради которых архитектура написана.
 *
 * Что проверяется:
 *  1. Обязательные артефакты существуют.
 *  2. DBML: таблицы, PK, ссылки, деньги в минорных единицах, tenant_id, уникальность.
 *  3. Mermaid: поддерживаемый тип, сбалансированные блоки, отсутствие C4-плагина.
 *  4. ADR: имя, уникальность номера, обязательные разделы, словарь статусов, индекс.
 *  5. Markdown-ссылки ведут на существующие файлы.
 *  6. Идентификаторы FR/QS/AC/IP/INV непрерывны и уникальны.
 *  7. Трассировка FR покрывает все требования; качественные сценарии совпадают с брифом.
 *  8. Сквозные ссылки: таблицы модели ↔ entities.md, модули ↔ components.mmd.
 *  9. Нет заглушек (TODO/TBD/FIXME).
 *
 * CLI: node scripts/validate-docs.mjs [root] [--json]
 * Тесты: node --test tests/
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN_DIR = 'docs/design';
const EXCLUDED_DIRS = new Set(['_examples', 'node_modules', '.git']);

export const REQUIRED_FILES = [
  'docs/design/brief.md',
  'docs/design/traceability.md',
  'docs/design/roadmap.md',
  'docs/design/risks.md',
  'docs/design/domain/README.md',
  'docs/design/domain/glossary.md',
  'docs/design/domain/entities.md',
  'docs/design/domain/invariants.md',
  'docs/design/domain/model.dbml',
  'docs/design/domain/lifecycles/invoice.mmd',
  'docs/design/domain/lifecycles/payment.mmd',
  'docs/design/domain/lifecycles/account.mmd',
  'docs/design/domain/lifecycles/meter.mmd',
  'docs/design/architecture/README.md',
  'docs/design/architecture/core-modules.md',
  'docs/design/architecture/quality-scenarios.md',
  'docs/design/architecture/scaling.md',
  'docs/design/architecture/context.mmd',
  'docs/design/architecture/containers.mmd',
  'docs/design/architecture/components.mmd',
  'docs/design/architecture/adr/README.md',
  'docs/design/ux/README.md',
  'docs/design/ux/scenarios.md',
  'docs/design/ux/screens.md',
  'docs/design/ux/payment-flow.mmd',
];

export const REQUIRED_ADRS = [
  '0001-local-first-desktop-modular-monolith.md',
  '0002-money-and-period-types.md',
  '0003-invoice-payment-allocation-separation.md',
  '0004-idempotent-imports-and-operations.md',
  '0005-local-transactions-and-change-log.md',
  '0006-profiles-and-local-access.md',
  '0007-invoice-immutability-and-reversal.md',
  '0008-data-file-backup-and-archive.md',
  '0009-cross-platform-desktop-and-installers.md',
  '0010-implementation-stack.md',
  '0011-cloud-sync-approach.md',
  '0012-receipt-recognition.md',
];

export const REQUIRED_GLOSSARY_TERMS = [
  'Профиль',
  'Роль',
  'Помещение',
  'Доля владения',
  'Поставщик',
  'Лицевой счёт',
  'Услуга',
  'Тариф',
  'Расчётный период',
  'Начисление',
  'Квитанция',
  'Строка квитанции',
  'Платёж',
  'Распределение',
  'Переплата / аванс',
  'Долг',
  'Баланс',
  'Сторно',
  'Счётчик',
  'Показание',
  'Поверка',
  'Отметка о передаче',
  'Напоминание',
  'Вложение',
  'Аудит-запись',
  'Файл данных',
  'Резервная копия',
  'Архив',
  'Переносимость',
  'Синхронизация',
  'Журнал изменений',
  'Распознавание',
  'Задание импорта',
  'Кандидат распознавания',
  'Шаблон поставщика',
  'Уверенность',
  'Миграция',
  'Версия схемы',
  'Минорные единицы',
  'Денежная сумма',
  'Период',
  'Bounded context',
  'Модуль ядра',
  'Порт',
  'Адаптер',
  'Fitness function',
  'Идемпотентность',
  'Локальный модульный монолит',
];

export const CORE_MODULES_IN_COMPONENTS = [
  'shared',
  'identity',
  'catalog',
  'metering',
  'billing',
  'invoicing',
  'payments',
  'ledger',
  'reminders',
  'documents',
  'recognition',
  'reporting',
  'portability',
  'sync',
];

const PLACEHOLDER_PATTERN = /\b(TODO|TBD|FIXME|XXX|lorem ipsum)\b/i;
const ALLOWED_DIAGRAM_TYPES =
  /^(flowchart|graph|stateDiagram-v2|stateDiagram|sequenceDiagram|erDiagram|classDiagram|journey|gantt|pie|mindmap|timeline|block-beta|zenuml)\b/;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function walk(dir, predicate) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function readText(file) {
  return readFileSync(file, 'utf8');
}

function rel(root, file) {
  return relative(root, file).split(sep).join('/');
}

function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

/** Уникальные номера из идентификаторов вида FR-01. */
export function collectIds(text, prefix) {
  const re = new RegExp(`\\b${prefix}-(\\d{2})\\b`, 'g');
  const found = new Set();
  for (const m of text.matchAll(re)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/** Непрерывность 1..N без пропусков и дублей возвращает null, иначе описание. */
export function checkContiguous(numbers) {
  if (numbers.length === 0) return 'идентификаторы не найдены';
  for (let i = 0; i < numbers.length; i += 1) {
    if (numbers[i] !== i + 1) return `ожидался номер ${i + 1}, найден ${numbers[i]}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// DBML
// ---------------------------------------------------------------------------

function parseTableBody(body) {
  const indexes = [];
  const indexBlock = body.match(/indexes\s*\{([\s\S]*?)\}/i);
  if (indexBlock) {
    for (const raw of indexBlock[1].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const unique = /\[[^\]]*unique[^\]]*\]/i.test(line);
      const cols = (line.match(/\(([^)]*)\)/) || [, line])[1]
        .split(',')
        .map((c) => c.trim().replace(/^`|`$/g, ''))
        .filter(Boolean);
      indexes.push({ columns: cols, unique });
    }
  }
  const withoutIndexes = body.replace(/indexes\s*\{[\s\S]*?\}/i, '');
  const columns = [];
  for (const raw of withoutIndexes.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (/^(note|note\s*:|table|ref|enum|project)\b/i.test(line)) continue;
    if (line.startsWith('}') || line.startsWith('[')) continue;
    const m = line.match(/^`?([A-Za-z_][A-Za-z0-9_]*)`?\s+([A-Za-z][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?(.*)$/);
    if (!m) continue;
    const [, name, type, args = '', rest] = m;
    const attrs = rest;
    columns.push({
      name,
      type,
      args,
      pk: /\[[^\]]*\bpk\b[^\]]*\]/i.test(attrs),
      unique: /\[[^\]]*\bunique\b[^\]]*\]/i.test(attrs),
      notNull: /\[[^\]]*\bnot null\b[^\]]*\]/i.test(attrs),
    });
  }
  return { columns, indexes };
}

/** Разбирает DBML в { tables: Map<name, {columns, indexes}>, refs: [...] }. */
export function parseDbml(text) {
  const clean = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const tables = new Map();
  const tableRe = /Table\s+([A-Za-z0-9_.]+)\s*(?:as\s+`?[A-Za-z0-9_]+`?)?\s*\{/g;
  let match;
  while ((match = tableRe.exec(clean))) {
    const name = match[1];
    let depth = 1;
    let i = tableRe.lastIndex;
    const start = i;
    while (i < clean.length && depth > 0) {
      if (clean[i] === '{') depth += 1;
      else if (clean[i] === '}') depth -= 1;
      i += 1;
    }
    const body = clean.slice(start, i - 1);
    tables.set(name, parseTableBody(body));
  }
  const refs = [];
  const refRe =
    /Ref(?:\s+[A-Za-z0-9_]+)?\s*:\s*`?([A-Za-z0-9_.]+)`?\.(?:`?([A-Za-z0-9_]+)`?|\(([^)]+)\))\s*(?:<>|<|>|-)\s*`?([A-Za-z0-9_.]+)`?\.(?:`?([A-Za-z0-9_]+)`?|\(([^)]+)\))/g;
  let refMatch;
  while ((refMatch = refRe.exec(clean))) {
    const columns = (single, list) =>
      single ? [single.replace(/`/g, '')] : list.split(',').map((c) => c.trim().replace(/`/g, ''));
    refs.push({
      from: { table: refMatch[1], columns: columns(refMatch[2], refMatch[3]) },
      to: { table: refMatch[4], columns: columns(refMatch[5], refMatch[6]) },
    });
  }
  return { tables, refs };
}

export function validateDbml(text, file = 'model.dbml') {
  const errors = [];
  const warnings = [];
  const add = (code, message) => errors.push({ code, file, message });
  const { tables, refs } = parseDbml(text);

  if (tables.size < 10) add('DBML_TOO_SMALL', `ожидалось ≥ 10 таблиц, найдено ${tables.size}`);
  for (const { from, to } of refs) {
    for (const end of [from, to]) {
      const table = tables.get(end.table);
      if (!table) {
        add('DBML_REF_MISSING_TABLE', `Ref ссылается на неизвестную таблицу «${end.table}»`);
        continue;
      }
      for (const column of end.columns) {
        if (!table.columns.some((c) => c.name === column)) {
          add('DBML_REF_MISSING_COLUMN', `в таблице «${end.table}» нет колонки «${column}»`);
        }
      }
    }
  }
  if (refs.length < 8) add('DBML_FEW_REFS', `ожидалось ≥ 8 внешних ключей, найдено ${refs.length}`);
  for (const { from, to } of refs) {
    if (from.columns.length !== to.columns.length) {
      add('DBML_REF_ARITY', `Ref ${from.table}→${to.table} связывает разное число колонок`);
    }
  }

  for (const [name, table] of tables) {
    if (table.columns.length === 0) {
      add('DBML_EMPTY_TABLE', `таблица «${name}» без колонок`);
      continue;
    }
    const hasPk = table.columns.some((c) => c.pk) || table.indexes.some((i) => i.unique && i.columns.length === 1 && i.columns[0] === 'id');
    if (!hasPk) add('DBML_NO_PK', `в таблице «${name}» нет первичного ключа`);
    for (const col of table.columns) {
      if (col.name.endsWith('_minor') && !/^(bigint|integer)$/i.test(col.type)) {
        add('DBML_MONEY_TYPE', `«${name}.${col.name}» должен быть bigint/integer, а не ${col.type} (C-02)`);
      }
      if (/^(float|real|double|money)$/i.test(col.type)) {
        add('DBML_FORBIDDEN_TYPE', `«${name}.${col.name}» использует недопустимый тип ${col.type} (C-02)`);
      }
      if (/^(period|billing_period)$/.test(col.name) && !/^(varchar|char)\s*\(\s*7\s*\)$/i.test(`${col.type}${col.args ? `(${col.args})` : ''}`)) {
        add('DBML_PERIOD_TYPE', `«${name}.${col.name}» должен быть varchar(7)/char(7) YYYY-MM (C-03)`);
      }
    }
    const dupes = new Set();
    for (const col of table.columns) {
      if (dupes.has(col.name)) add('DBML_DUPLICATE_COLUMN', `«${name}.${col.name}» объявлена дважды`);
      dupes.add(col.name);
    }
  }

  const hasUnique = (tableName, columns) => {
    const table = tables.get(tableName);
    if (!table) return false;
    const set = new Set(columns);
    return table.indexes.some(
      (i) => i.unique && i.columns.length === columns.length && i.columns.every((c) => set.has(c)),
    ) || (columns.length === 1 && table.columns.find((c) => c.name === columns[0])?.unique === true);
  };

  const invoiceUnique = (() => {
    const table = tables.get('invoice');
    if (!table) return false;
    return table.indexes.some(
      (i) => i.unique && i.columns.includes('account_id') && i.columns.includes('period'),
    );
  })();
  if (!invoiceUnique) {
    add('DBML_INVOICE_UNIQUE', 'нужен уникальный индекс invoice, покрывающий (account_id, period) (INV-03)');
  }
  if (!hasUnique('payment', ['idempotency_key'])) {
    add('DBML_PAYMENT_UNIQUE', 'нужен уникальный ключ payment(idempotency_key) (INV-13)');
  }

  const attachment = tables.get('attachment');
  if (attachment && !attachment.columns.some((c) => c.name === 'content')) {
    add('DBML_ATTACHMENT_BLOB', 'вложение должно храниться в файле данных как BLOB (ADR-0008)');
  }

  return { errors, warnings, stats: { tables: tables.size, refs: refs.length } };
}

// ---------------------------------------------------------------------------
// Mermaid
// ---------------------------------------------------------------------------

export function validateMermaid(text, file = 'diagram.mmd') {
  const errors = [];
  const warnings = [];
  const add = (code, message) => errors.push({ code, file, message });
  const body = text.replace(/^\s*%%[^\n]*$/gm, '').trim();

  if (!body) {
    add('MERMAID_EMPTY', 'диаграмма пуста');
    return { errors, warnings };
  }
  const first = body.split('\n')[0].trim();
  if (!ALLOWED_DIAGRAM_TYPES.test(first)) {
    add('MERMAID_TYPE', `неподдерживаемый тип диаграммы: «${first.slice(0, 40)}»`);
  }
  if (/\b(C4Context|C4Container|C4Component|C4Dynamic)\b/.test(body)) {
    add('MERMAID_C4_PLUGIN', 'C4-плагин не поддерживается mmdc/GitHub — используйте flowchart (см. README)');
  }

  const withoutStrings = body.replace(/"[^"\n]*"/g, '""');
  const opens = (withoutStrings.match(/\{/g) || []).length;
  const closes = (withoutStrings.match(/\}/g) || []).length;
  if (opens !== closes) {
    add('MERMAID_BRACES', `несбалансированные фигурные скобки: ${opens} открыто, ${closes} закрыто`);
  }

  const lines = withoutStrings.split('\n').map((l) => l.trim());
  let depth = 0;
  for (const line of lines) {
    if (/^(subgraph|alt|opt|loop|par|critical|break|box)\b/.test(line)) depth += 1;
    else if (/^end\b/.test(line) && !/^end\s+note\b/.test(line)) {
      if (depth > 0) depth -= 1;
    }
  }
  if (depth !== 0) add('MERMAID_BLOCKS', `несбалансированные блоки subgraph/alt/end: глубина ${depth}`);

  if (/-->|->>|-->>|---|\.\.\./.test(body) === false && /^(flowchart|graph|stateDiagram|sequenceDiagram)/.test(first)) {
    warnings.push({ code: 'MERMAID_NO_EDGES', file, message: 'в диаграмме не найдено ни одной связи' });
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Markdown: links, ADR, glossary, ids
// ---------------------------------------------------------------------------

export function extractMarkdownLinks(text) {
  const links = [];
  const re = /!?\[[^\]]*]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  for (const m of stripFencedCode(text).matchAll(re)) links.push(m[1]);
  return links;
}

export function validateMarkdownLinks(text, file, root) {
  const errors = [];
  for (const raw of extractMarkdownLinks(text)) {
    if (/^(https?:|mailto:|tel:|#)/i.test(raw)) continue;
    const target = raw.split('#')[0];
    if (!target) continue;
    const resolved = resolve(dirname(file), decodeURIComponent(target));
    if (!existsSync(resolved)) {
      errors.push({ code: 'MD_BROKEN_LINK', file: rel(root, file), message: `ссылка ведёт в никуда: ${raw}` });
    }
  }
  return { errors };
}

export function validateAdr({ fileName, text, allAdrFiles = [] }) {
  const errors = [];
  const add = (code, message) => errors.push({ code, file: fileName, message });
  if (!/^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(fileName)) {
    add('ADR_NAME', 'имя ADR должно быть NNNN-kebab-case.md');
  }
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].toLowerCase());
  const has = (words) => headings.some((h) => words.some((w) => h.includes(w)));
  const required = [
    [['статус', 'status'], 'ADR_STATUS'],
    [['контекст', 'context'], 'ADR_CONTEXT'],
    [['решение', 'decision'], 'ADR_DECISION'],
    [['последстви', 'consequences'], 'ADR_CONSEQUENCES'],
    [['вариант', 'альтернатив', 'alternatives', 'options'], 'ADR_ALTERNATIVES'],
  ];
  for (const [words, code] of required) {
    if (!has(words)) add(code, `нет обязательного раздела (${words.join('/')})`);
  }
  const lines = text.split('\n');
  const statusHeading = lines.findIndex((l) => /^#{1,6}\s*(статус|status)/i.test(l.trim()));
  let statusValue = '';
  if (statusHeading >= 0) {
    for (let i = statusHeading + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line) {
        statusValue = line;
        break;
      }
    }
  }
  if (!/(proposed|accepted|rejected|deprecated|superseded|предложен|принят|отклонён|устарел|заменён)/i.test(statusValue)) {
    add('ADR_STATUS_VALUE', 'статус не из словаря proposed/accepted/rejected/deprecated/superseded');
  }
  const num = Number(fileName.slice(0, 4));
  for (const other of allAdrFiles) {
    if (other !== fileName && Number(other.slice(0, 4)) === num) {
      add('ADR_DUPLICATE_NUMBER', `номер ${fileName.slice(0, 4)} уже занят файлом ${other}`);
    }
  }
  return { errors };
}

export function validateGlossary(text, file = 'glossary.md') {
  const errors = [];
  const add = (code, message) => errors.push({ code, file, message });
  const terms = [...text.matchAll(/^\|\s*\*\*(.+?)\*\*/gm)].map((m) => m[1].trim());
  if (terms.length < 20) add('GLOSSARY_TOO_SMALL', `ожидалось ≥ 20 терминов, найдено ${terms.length}`);
  const seen = new Set();
  for (const term of terms) {
    if (seen.has(term)) add('GLOSSARY_DUPLICATE', `термин «${term}» объявлен дважды`);
    seen.add(term);
  }
  for (const required of REQUIRED_GLOSSARY_TERMS) {
    if (!text.includes(required)) add('GLOSSARY_MISSING_TERM', `нет обязательного термина «${required}»`);
  }
  return { errors, stats: { terms: terms.length } };
}

export function validateIds({ brief, qualityScenarios, invariants, traceability }) {
  const errors = [];
  const add = (code, message) => errors.push({ code, file: 'ids', message });

  const fr = collectIds(brief, 'FR');
  const qsBrief = collectIds(brief, 'QS');
  const qsDoc = collectIds(qualityScenarios, 'QS');
  const inv = collectIds(invariants, 'INV');
  const ac = collectIds(brief, 'AC');
  const ip = collectIds(brief, 'IP');

  const frProblem = checkContiguous(fr);
  if (frProblem) add('IDS_FR', `FR: ${frProblem}`);
  const acProblem = checkContiguous(ac);
  if (acProblem) add('IDS_AC', `AC: ${acProblem}`);
  const ipProblem = checkContiguous(ip);
  if (ipProblem) add('IDS_IP', `IP: ${ipProblem}`);
  const invProblem = checkContiguous(inv);
  if (invProblem) add('IDS_INV', `INV: ${invProblem}`);
  if (inv.length < 15) add('IDS_INV_COUNT', `ожидалось ≥ 15 инвариантов, найдено ${inv.length}`);

  const missingQs = qsBrief.filter((n) => !qsDoc.includes(n));
  if (missingQs.length) add('IDS_QS_MISSING', `в quality-scenarios.md отсутствуют: ${missingQs.map((n) => `QS-${String(n).padStart(2, '0')}`).join(', ')}`);
  const extraQs = qsDoc.filter((n) => !qsBrief.includes(n));
  if (extraQs.length) add('IDS_QS_EXTRA', `quality-scenarios.md содержит не заявленные в брифе: ${extraQs.map((n) => `QS-${String(n).padStart(2, '0')}`).join(', ')}`);

  const traced = collectIds(traceability, 'FR');
  const uncovered = fr.filter((n) => !traced.includes(n));
  if (uncovered.length) {
    add('IDS_FR_UNTRACED', `FR без строки трассировки: ${uncovered.map((n) => `FR-${String(n).padStart(2, '0')}`).join(', ')}`);
  }
  return { errors, stats: { fr: fr.length, qs: qsBrief.length, inv: inv.length, ac: ac.length, ip: ip.length, traced: traced.length } };
}

// ---------------------------------------------------------------------------
// repository-level
// ---------------------------------------------------------------------------

export function validateCrossReferences({ modelText, entitiesText, coreModulesText, componentsText }) {
  const errors = [];
  const { tables } = parseDbml(modelText);
  for (const name of tables.keys()) {
    const forms = [name, name.replace(/_/g, ' ')];
    if (!forms.some((f) => entitiesText.includes(f))) {
      errors.push({ code: 'XREF_TABLE_UNDOCUMENTED', file: 'domain/entities.md', message: `таблица «${name}» не описана в entities.md` });
    }
  }
  for (const module of CORE_MODULES_IN_COMPONENTS) {
    if (!componentsText.includes(module)) {
      errors.push({ code: 'XREF_MODULE_MISSING', file: 'architecture/components.mmd', message: `модуль «${module}» не показан на компонентной диаграмме` });
    }
    if (!coreModulesText.includes(`\`${module}\``) && !coreModulesText.includes(module)) {
      errors.push({ code: 'XREF_MODULE_UNDOCUMENTED', file: 'architecture/core-modules.md', message: `модуль «${module}» отсутствует в карте модулей` });
    }
  }
  return { errors };
}

/**
 * Полная проверка репозитория. Возвращает { errors, warnings, stats }.
 * root — абсолютный путь к корню проекта.
 */
export function validateRepository(root = process.cwd()) {
  const errors = [];
  const warnings = [];
  const stats = {};
  const add = (code, file, message) => errors.push({ code, file, message });

  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(root, file))) add('FILE_MISSING', file, 'обязательный артефакт отсутствует');
  }
  for (const adr of REQUIRED_ADRS) {
    if (!existsSync(join(root, 'docs/design/architecture/adr', adr))) {
      add('ADR_MISSING', `docs/design/architecture/adr/${adr}`, 'обязательное решение отсутствует');
    }
  }

  const designRoot = join(root, DESIGN_DIR);
  const markdown = walk(designRoot, (f) => f.endsWith('.md'));
  const mermaid = walk(designRoot, (f) => f.endsWith('.mmd'));
  const dbml = walk(designRoot, (f) => f.endsWith('.dbml'));
  stats.files = markdown.length + mermaid.length + dbml.length;
  stats.mermaid = mermaid.length;

  for (const file of [...markdown, ...mermaid, ...dbml]) {
    const text = readText(file);
    if (PLACEHOLDER_PATTERN.test(text)) {
      add('PLACEHOLDER', rel(root, file), 'найден маркер незавершённости (TODO/TBD/FIXME/XXX)');
    }
  }

  for (const file of markdown) {
    const text = readText(file);
    const { errors: linkErrors } = validateMarkdownLinks(text, file, root);
    errors.push(...linkErrors);
  }

  for (const file of dbml) {
    const result = validateDbml(readText(file), rel(root, file));
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    stats.tables = result.stats.tables;
    stats.refs = result.stats.refs;
  }

  for (const file of mermaid) {
    const result = validateMermaid(readText(file), rel(root, file));
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const adrDir = join(designRoot, 'architecture/adr');
  if (existsSync(adrDir)) {
    const adrFiles = readdirSync(adrDir).filter((f) => f.endsWith('.md'));
    const indexText = existsSync(join(adrDir, 'README.md')) ? readText(join(adrDir, 'README.md')) : '';
    stats.adrs = adrFiles.filter((f) => /^\d{4}-/.test(f)).length;
    for (const fileName of adrFiles) {
      if (!/^\d{4}-/.test(fileName)) continue;
      const { errors: adrErrors } = validateAdr({ fileName, text: readText(join(adrDir, fileName)), allAdrFiles: adrFiles });
      errors.push(...adrErrors);
      if (!indexText.includes(fileName)) {
        add('ADR_INDEX', `architecture/adr/README.md`, `решение ${fileName} отсутствует в индексе`);
      }
    }
  }

  const read = (p) => (existsSync(join(root, p)) ? readText(join(root, p)) : '');
  const brief = read('docs/design/brief.md');
  const qualityScenarios = read('docs/design/architecture/quality-scenarios.md');
  const invariants = read('docs/design/domain/invariants.md');
  const traceability = read('docs/design/traceability.md');

  if (brief && qualityScenarios && invariants && traceability) {
    const idResult = validateIds({ brief, qualityScenarios, invariants, traceability });
    errors.push(...idResult.errors);
    Object.assign(stats, idResult.stats);
  }

  const glossaryFile = join(root, 'docs/design/domain/glossary.md');
  if (existsSync(glossaryFile)) {
    const result = validateGlossary(readText(glossaryFile));
    errors.push(...result.errors);
    Object.assign(stats, result.stats);
  }

  const modelText = read('docs/design/domain/model.dbml');
  const entitiesText = read('docs/design/domain/entities.md');
  const coreModulesText = read('docs/design/architecture/core-modules.md');
  const componentsText = read('docs/design/architecture/components.mmd');
  if (modelText && entitiesText && coreModulesText && componentsText) {
    const result = validateCrossReferences({ modelText, entitiesText, coreModulesText, componentsText });
    errors.push(...result.errors);
  }

  return { errors, warnings, stats };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function formatReport(result) {
  const lines = [];
  const { errors, warnings, stats } = result;
  if (errors.length === 0) {
    lines.push('OK: артефакты согласованы.');
  } else {
    lines.push(`FAIL: ${errors.length} ошибок.`);
    for (const e of errors) lines.push(`  [${e.code}] ${e.file}: ${e.message}`);
  }
  if (warnings.length) {
    lines.push(`Предупреждения: ${warnings.length}`);
    for (const w of warnings) lines.push(`  [${w.code}] ${w.file}: ${w.message}`);
  }
  lines.push(`Статистика: ${JSON.stringify(stats)}`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const rootArg = args.find((a) => !a.startsWith('--'));
  const root = resolve(rootArg || process.cwd());
  const result = validateRepository(root);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(result)}\n`);
  }
  process.exit(errorsCount(result) > 0 ? 1 : 0);
}

function errorsCount(result) {
  return result.errors.length;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
