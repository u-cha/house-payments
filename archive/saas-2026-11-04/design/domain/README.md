# Домен: навигация по артефактам

Раздел `docs/design/domain/` описывает предметную модель MVP: термины, сущности,
инварианты, физическую схему и жизненные циклы финансовых документов. Это
design-only артефакты: кода приложения здесь нет, источник истины — текст в git
(C-07).

## Порядок чтения

1. **[glossary.md](./glossary.md)** — канонические термины. Читается первым:
   дальше слова «счёт», «лицевой счёт», «платёж», «распределение», «сторно»
   употребляются только в этом значении.
2. **[entities.md](./entities.md)** — сущности и агрегаты: назначение, атрибуты,
   владеющий модуль, состояния, связи и причастные инварианты.
3. **[invariants.md](./invariants.md)** — `INV-01 … INV-20`: формулировка,
   обоснование, слой принуждения и предлагаемая исполняемая проверка. Нумерация —
   контракт, на неё ссылаются архитектура и трассировка.
4. **[model.dbml](./model.dbml)** — каноническая физическая модель: таблицы,
   типы, внешние ключи, уникальность. ERD и SQL — производные от этого файла.
5. **Жизненные циклы** — машины состояний:
   - [invoice.mmd](./lifecycles/invoice.mmd) — счёт/квитанция;
   - [payment.mmd](./lifecycles/payment.mmd) — платёж;
   - [account.mmd](./lifecycles/account.mmd) — лицевой счёт.

## Состав раздела

| Файл | Что фиксирует | Ключевые идентификаторы |
|---|---|---|
| [glossary.md](./glossary.md) | Словарь терминов и правила словоупотребления | — |
| [entities.md](./entities.md) | 23 сущности, агрегаты, границы транзакций, допущения DM-A-01…DM-A-06 | INV-* |
| [invariants.md](./invariants.md) | 20 инвариантов и способы их принуждения | INV-01…INV-20 |
| [model.dbml](./model.dbml) | 23 таблицы, 20 enum-типов, составные внешние ключи по тенанту | INV-01…INV-20 |
| [lifecycles/invoice.mmd](./lifecycles/invoice.mmd) | `Draft → Issued → PartiallyPaid / Paid / Overdue → Closed`, `Void` | INV-10, INV-11, INV-12 |
| [lifecycles/payment.mmd](./lifecycles/payment.mmd) | `Received → PartiallyAllocated → Allocated`, `Reversed` | INV-07, INV-13, INV-19 |
| [lifecycles/account.mmd](./lifecycles/account.mmd) | `Open → Suspended → Closed` | INV-08, INV-20 |

## Связь с остальными разделами

- Границы задачи, требования FR-01…FR-16, ограничения C-01…C-07 и критерии
  приёмки — в [brief.md](../brief.md).
- Модули, публичные контракты, события и транзакционные границы — в
  [core-modules.md](../architecture/core-modules.md).
- Связь требований, модулей, сущностей и инвариантов — в
  [traceability.md](../traceability.md).
- Пользовательские сценарии и экраны — в `docs/design/ux/` (владелец — другой
  поток; здесь на них не ссылаемся, чтобы не дублировать контракт).

## Правила сопровождения

- Новый термин сначала попадает в [glossary.md](./glossary.md), затем
  используется в текстах и коде.
- Новый инвариант получает следующий свободный номер `INV-21`, а не вставляется
  в середину: номера уже процитированы в архитектуре и трассировке.
- Изменение `model.dbml` требует синхронной правки [entities.md](./entities.md) и
  проверки затронутых инвариантов. Обратное тоже верно.
- Схема и диаграммы не рисуются руками: правка только в `.dbml`/`.mmd`, производные
  пересобираются скриптом (C-07).
- Все суммы — в копейках, если не указано иное; все периоды — `YYYY-MM`
  (C-02, C-03).

## Проверка артефактов

Модель и диаграммы обязаны рендериться без ошибок (AC-08). Команды выполняются
из корня репозитория после `pnpm install`:

```bash
# ERD из DBML: exit 0 и непустой SVG
node_modules/.bin/dbml-renderer \
  -i docs/design/domain/model.dbml \
  -o /tmp/model-check.svg

# Проверка, что DBML разбирается в SQL (PostgreSQL)
node_modules/.bin/dbml2sql --postgres \
  -o /tmp/model-check.sql docs/design/domain/model.dbml

# Машины состояний: для каждого файла exit 0
node_modules/.bin/mmdc \
  -i docs/design/domain/lifecycles/invoice.mmd \
  -o /tmp/invoice.svg -p .tools/puppeteer-config.json -b white
node_modules/.bin/mmdc \
  -i docs/design/domain/lifecycles/payment.mmd \
  -o /tmp/payment.svg -p .tools/puppeteer-config.json -b white
node_modules/.bin/mmdc \
  -i docs/design/domain/lifecycles/account.mmd \
  -o /tmp/account.svg -p .tools/puppeteer-config.json -b white
```

Полная сборка всех диаграмм — `pnpm diagrams`; общие правила рендера описаны в
корневом README репозитория.
