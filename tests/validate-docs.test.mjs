import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseDbml,
  validateDbml,
  validateMermaid,
  validateAdr,
  validateGlossary,
  validateIds,
  validateMarkdownLinks,
  validateRepository,
  collectIds,
  checkContiguous,
  formatReport,
} from '../scripts/validate-docs.mjs';

const ids = (prefix, count) =>
  Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`).join(' ');

// ---------------------------------------------------------------------------
// DBML
// ---------------------------------------------------------------------------

test('parseDbml: таблицы, колонки, уникальный составной индекс и ссылки', () => {
  const dbml = `
    Table account {
      id uuid [pk]
      tenant_id uuid
      number varchar(32) [unique]
    }
    Table invoice {
      id uuid [pk]
      tenant_id uuid
      account_id uuid
      period varchar(7)
      total_minor bigint
      indexes {
        (account_id, period) [unique]
      }
    }
    Ref: account.id < invoice.account_id
  `;
  const { tables, refs } = parseDbml(dbml);
  assert.equal(tables.size, 2);
  assert.equal(tables.get('invoice').columns.find((c) => c.name === 'period').type, 'varchar');
  assert.equal(tables.get('invoice').columns.find((c) => c.name === 'period').args, '7');
  assert.deepEqual(tables.get('invoice').indexes, [{ columns: ['account_id', 'period'], unique: true }]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].from.table, 'account');
  assert.deepEqual(refs[0].from.columns, ['id']);
});

test('parseDbml: составной внешний ключ с несколькими колонками', () => {
  const dbml = `
    Table building {
      id uuid [pk]
      tenant_id uuid
    }
    Table property {
      id uuid [pk]
      tenant_id uuid
      building_id uuid
    }
    Ref: building.(tenant_id, id) < property.(tenant_id, building_id)
  `;
  const { refs } = parseDbml(dbml);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0].from.columns, ['tenant_id', 'id']);
  assert.deepEqual(refs[0].to.columns, ['tenant_id', 'building_id']);
  const errors = validateDbml(dbml).errors;
  assert.equal(errors.filter((e) => e.code.startsWith('DBML_REF')).length, 0);
});

test('validateDbml: битая ссылка обнаруживается', () => {
  const dbml = `
    Table a {
      id uuid [pk]
      tenant_id uuid
    }
    Ref: a.id < ghost.question_id
  `;
  const { errors } = validateDbml(dbml);
  assert.ok(errors.some((e) => e.code === 'DBML_REF_MISSING_TABLE'));
});

test('validateDbml: деньги во float и запрещённые типы отклоняются (C-02)', () => {
  const dbml = `
    Table a {
      id uuid [pk]
      tenant_id uuid
      amount_minor float
      price double precision
    }
  `;
  const { errors } = validateDbml(dbml);
  assert.ok(errors.some((e) => e.code === 'DBML_MONEY_TYPE'));
  assert.ok(errors.some((e) => e.code === 'DBML_FORBIDDEN_TYPE'));
});

test('validateDbml: деньги — integer/bigint, таблица без PK отклоняется', () => {
  const dbml = `
    Table ok {
      id text [pk]
      amount_minor integer
      total_minor bigint
    }
    Table bad {
      label text
    }
  `;
  const { errors } = validateDbml(dbml);
  assert.equal(errors.filter((e) => e.code === 'DBML_MONEY_TYPE').length, 0);
  assert.ok(errors.some((e) => e.code === 'DBML_NO_PK'));
});

test('validateDbml: вложение обязано храниться в файле данных (ADR-0008)', () => {
  const dbml = `
    Table attachment {
      id text [pk]
      sha256 text
    }
  `;
  const { errors } = validateDbml(dbml);
  assert.ok(errors.some((e) => e.code === 'DBML_ATTACHMENT_BLOB'));
});

test('validateDbml: период должен быть varchar(7) (C-03)', () => {
  const dbml = `
    Table accrual {
      id uuid [pk]
      tenant_id uuid
      period date
      amount_minor bigint
    }
  `;
  const { errors } = validateDbml(dbml);
  assert.ok(errors.some((e) => e.code === 'DBML_PERIOD_TYPE'));
});

test('validateDbml: отсутствие уникальности счёт(счёт,период) и платежа(тенант,ключ) — ошибка', () => {
  const dbml = `
    Table invoice {
      id uuid [pk]
      tenant_id uuid
      account_id uuid
      period varchar(7)
    }
    Table payment {
      id uuid [pk]
      tenant_id uuid
      idempotency_key varchar(64)
    }
  `;
  const { errors } = validateDbml(dbml);
  assert.ok(errors.some((e) => e.code === 'DBML_INVOICE_UNIQUE'));
  assert.ok(errors.some((e) => e.code === 'DBML_PAYMENT_UNIQUE'));
});

// ---------------------------------------------------------------------------
// Mermaid
// ---------------------------------------------------------------------------

test('validateMermaid: flowchart и stateDiagram принимаются', () => {
  assert.equal(validateMermaid('flowchart LR\n  A["Бухгалтер"] --> B["API"]').errors.length, 0);
  assert.equal(
    validateMermaid('stateDiagram-v2\n  [*] --> Draft\n  Draft --> Issued: выставить\n  Issued --> [*]').errors.length,
    0,
  );
  assert.equal(
    validateMermaid('sequenceDiagram\n  actor U as Пользователь\n  U->>API: запрос\n  alt ошибка\n    API-->>U: отказ\n  end').errors.length,
    0,
  );
});

test('validateMermaid: C4-плагин запрещён (не рендерится)', () => {
  const { errors } = validateMermaid('C4Context\n  Person(a, "A")');
  assert.ok(errors.some((e) => e.code === 'MERMAID_TYPE'));
  assert.ok(errors.some((e) => e.code === 'MERMAID_C4_PLUGIN'));
});

test('validateMermaid: несбалансированные subgraph и скобки', () => {
  assert.ok(validateMermaid('flowchart LR\n  subgraph S\n  A-->B').errors.some((e) => e.code === 'MERMAID_BLOCKS'));
  assert.equal(validateMermaid('flowchart LR\n  subgraph S\n  A-->B\n  end').errors.length, 0);
  assert.ok(validateMermaid('flowchart LR\n  A --> B\n}').errors.some((e) => e.code === 'MERMAID_BRACES'));
});

// ---------------------------------------------------------------------------
// ADR
// ---------------------------------------------------------------------------

const goodAdr = `# 0001. Модульный монолит

## Статус

proposed

## Контекст

Нужна архитектура.

## Рассмотренные варианты

1. Монолит.
2. Микросервисы.

## Решение

Модульный монолит.

## Последствия

Проще транзакции.
`;

test('validateAdr: корректный ADR проходит', () => {
  assert.equal(validateAdr({ fileName: '0001-modular-monolith.md', text: goodAdr }).errors.length, 0);
});

test('validateAdr: отсутствие решения и статуса вне словаря', () => {
  const bad = `# 0001. X

## Статус

как-нибудь
`;
  const { errors } = validateAdr({ fileName: '0001-x.md', text: bad });
  assert.ok(errors.some((e) => e.code === 'ADR_DECISION'));
  assert.ok(errors.some((e) => e.code === 'ADR_STATUS_VALUE'));
});

test('validateAdr: имя файла и дубликат номера', () => {
  assert.ok(validateAdr({ fileName: 'adr-one.md', text: goodAdr }).errors.some((e) => e.code === 'ADR_NAME'));
  const dup = validateAdr({
    fileName: '0001-modular-monolith.md',
    text: goodAdr,
    allAdrFiles: ['0001-modular-monolith.md', '0001-other.md'],
  });
  assert.ok(dup.errors.some((e) => e.code === 'ADR_DUPLICATE_NUMBER'));
});

// ---------------------------------------------------------------------------
// glossary / ids / links
// ---------------------------------------------------------------------------

test('validateGlossary: обязательные термины и дубликаты', () => {
  const text = '| **Организация** | x |\n| **Организация** | y |';
  const { errors } = validateGlossary(text);
  assert.ok(errors.some((e) => e.code === 'GLOSSARY_DUPLICATE'));
  assert.ok(errors.some((e) => e.code === 'GLOSSARY_MISSING_TERM'));
});

test('collectIds: уникальные номера по возрастанию', () => {
  assert.deepEqual(collectIds('FR-02 FR-01 FR-02', 'FR'), [1, 2]);
  assert.deepEqual(collectIds('QS-10 QS-02', 'QS'), [2, 10]);
  assert.equal(checkContiguous([1, 2, 3]), null);
  assert.match(checkContiguous([1, 3]), /ожидался номер 2/);
});

test('validateIds: непокрытые требования и расхождение QS', () => {
  const brief = `FR-01 FR-02 QS-01 QS-02 AC-01 AC-03 IP-01 IP-02`;
  const result = validateIds({
    brief,
    qualityScenarios: 'QS-01 QS-03',
    invariants: ids('INV', 15),
    traceability: 'FR-01',
  });
  assert.ok(result.errors.some((e) => e.code === 'IDS_FR_UNTRACED'));
  assert.ok(result.errors.some((e) => e.code === 'IDS_QS_MISSING'));
  assert.ok(result.errors.some((e) => e.code === 'IDS_QS_EXTRA'));
  assert.ok(result.errors.some((e) => e.code === 'IDS_AC'));
});

test('validateMarkdownLinks: битая ссылка обнаруживается, внешние игнорируются', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hp-links-'));
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '[ok](other.md) [bad](missing.md) [web](https://example.com) [anchor](#top)');
    writeFileSync(join(dir, 'other.md'), '# ok');
    const { errors } = validateMarkdownLinks(readFileSync(file, 'utf8'), file, dir);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /missing\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// repository
// ---------------------------------------------------------------------------

test('validateRepository: пустой каталог даёт ошибки об отсутствии артефактов', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hp-empty-'));
  try {
    const result = validateRepository(dir);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some((e) => e.code === 'FILE_MISSING'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateRepository: реальный репозиторий согласован', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = validateRepository(root);
  assert.deepEqual(result.errors, [], `\n${formatReport(result)}`);
  assert.ok(result.stats.tables >= 23, 'в модели должно быть ≥ 23 таблиц');
  assert.ok(result.stats.mermaid >= 8, 'должно быть ≥ 8 диаграмм');
  assert.ok(result.stats.adrs >= 12, 'должно быть ≥ 12 ADR');
  assert.ok(result.stats.fr >= 18, 'должно быть ≥ 18 FR');
  assert.ok(result.stats.inv >= 21, 'должно быть ≥ 21 инвариантов');
});
