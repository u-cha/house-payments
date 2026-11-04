# Матрица прослеживаемости

Связывает требования [brief.md](brief.md) с модулями, сущностями, инвариантами,
решениями и проверками. Строка без проверки — незакрытое требование; проверка без
требования — избыточная работа.

Обозначения: **Модуль** — владелец функциональности; **Таблицы** — из
[domain/model.dbml](domain/model.dbml); **INV** — [domain/invariants.md](domain/invariants.md);
**ADR** — [architecture/adr/](architecture/adr/README.md); **UX** — [ux/scenarios.md](ux/scenarios.md).

## 1. Функциональные требования

| FR | Модуль | Таблицы | INV | ADR | UX | Проверка |
|---|---|---|---|---|---|---|
| FR-01 | `registry` | `building`, `property`, `account` | INV-08, INV-16 | 0001, 0006 | US-01, US-10 | `validate-docs` (tenant_id, refs), архитектурный тест модулей |
| FR-02 | `registry` | `payer`, `payer_property` | INV-16 | 0006 | US-01 | `validate-docs` (refs), unit-тест связи плательщик↔помещение |
| FR-03 | `tariffs` | `service`, `tariff` | INV-04 | 0002 | US-01 | unit-тест выбора действующего тарифа на дату |
| FR-04 | `billing` | `period_run`, `accrual` | INV-03, INV-04, INV-09 | 0005 | US-02 | QS-01 нагрузочный тест; идемпотентность повторного прогона |
| FR-05 | `invoicing` | `invoice`, `invoice_line` | INV-05, INV-10, INV-12 | 0007 | US-03 | DBML: уникальный индекс счёта; интеграционный тест «сумма строк = итог» |
| FR-06 | `payments` | `payment` | INV-13 | 0004 | US-04 | QS-02; unit-тест повторного ключа идемпотентности |
| FR-07 | `payments` | `import_batch`, `reconciliation_item` | INV-13, INV-16 | 0008 | US-06 | QS-03; регрессия «повторный импорт не создаёт платежей» |
| FR-08 | `ledger` | `allocation` | INV-06, INV-14, INV-15 | 0003 | US-05 | QS-04 конкурентный тест распределения |
| FR-09 | `payments`, `ledger` | `payment`, `account_balance` | INV-07, INV-20 | 0003 | US-04, US-05 | интеграционный тест «переплата = аванс» |
| FR-10 | `billing`, `invoicing` | `accrual`, `invoice`, `audit_event` | INV-09, INV-11, INV-19 | 0007 | US-07 | unit-тест: сторно один раз, void только без распределений |
| FR-11 | `notifications`, `registry` | `notification`, `account`, `invoice` | INV-16 | 0006 | US-08 | QS-05 тест изоляции выдачи жителю |
| FR-12 | `identity` | `app_user`, `membership`, `role` | INV-16 | 0006 | US-11 | QS-05; тест «последний администратор не удаляется» |
| FR-13 | `shared` | `audit_event` | INV-18 | 0005, 0007 | US-12 | QS-06; архитектурный тест «нет записи без аудита» |
| FR-14 | `reporting` | read-model (материализованные представления) | INV-20 | 0001 | US-09 | интеграционный тест сверки отчёта с остатками счетов |
| FR-15 | `billing`, `ledger` | вне MVP (`penalty`) | — | — | — | после MVP: ADR + модель + тест начисления пеней |
| FR-16 | `integrations` | вне MVP (экспорт) | — | — | — | после MVP: контрактный тест экспорта в 1С |

> FR-15 и FR-16 явно вынесены за MVP (brief §3) и поэтому не имеют таблиц в модели:
> это осознанная граница, а не пропуск. При включении в scope добавляется ADR и
> обновляется [model.dbml](domain/model.dbml).

## 2. Точки реализации

| IP | Артефакт | Проверка |
|---|---|---|
| IP-01 | [architecture/core-modules.md](architecture/core-modules.md) | `XREF_MODULE_*`: модули на диаграмме и в карте |
| IP-02 | [domain/model.dbml](domain/model.dbml) | `validate-docs`: таблицы, PK, refs, tenant_id |
| IP-03 | [domain/invariants.md](domain/invariants.md) | `IDS_INV`: непрерывность INV-01…INV-20 |
| IP-04 | [domain/lifecycles/](domain/lifecycles/invoice.mmd) | `validateMermaid` + рендер `pnpm diagrams` |
| IP-05 | [adr/0001-modular-monolith.md](architecture/adr/0001-modular-monolith.md) | `validateAdr`: разделы и статус |
| IP-06 | ADR-0002…ADR-0006 | `validateAdr` для каждого файла |
| IP-07 | C4: [context](architecture/context.mmd), [containers](architecture/containers.mmd), [components](architecture/components.mmd) | `validateMermaid`, рендер без C4-плагина |
| IP-08 | [architecture/quality-scenarios.md](architecture/quality-scenarios.md) | `IDS_QS_*`: набор QS совпадает с брифом |
| IP-09 | [architecture/core-modules.md](architecture/core-modules.md) §6 | ревью: единый `AppError`, коды причин |
| IP-10 | [ux/scenarios.md](ux/scenarios.md), [ux/screens.md](ux/screens.md) | ревью: каждый FR покрыт сценарием |
| IP-11 | [scripts/validate-docs.mjs](../../scripts/validate-docs.mjs), `tests/` | `pnpm test` (позитивные и негативные кейсы) |
| IP-12 | этот файл | `IDS_FR_UNTRACED`: ни одного FR без строки |

## 3. Критерии приёмки → доказательство

| AC | Чем подтверждается |
|---|---|
| AC-01 | brief §1–§7: стейкхолдеры, границы, A-01, FR, IP |
| AC-02 | `validate-docs`: `DBML_*` (23 таблицы, 46 FK, tenant_id, минорные единицы, периоды) |
| AC-03 | invariants.md: INV-01…INV-20, у каждого слой принуждения и проверка |
| AC-04 | ADR-0001 и core-modules.md: стиль, модули, правила зависимостей |
| AC-05 | quality-scenarios.md: QS-01…QS-10 с мерой и способом проверки |
| AC-06 | scenarios.md: 12 сценариев, screens.md: 24 экрана, все FR(MVP) покрыты |
| AC-07 | этот файл: FR → модуль → таблица → INV → ADR → UX → проверка |
| AC-08 | `pnpm diagrams` рендерит все `.mmd`/`.dbml`; проверено вручную на 8 диаграммах |
| AC-09 | `pnpm test`: 19 тестов, включая негативные (валидатор умеет падать) |
| AC-10 | brief §8 (OQ-01…OQ-06) и раздел «Риски» ниже |

## 4. Сценарии качества → проверка

| QS | Проверка | Где |
|---|---|---|
| QS-01 | нагрузочный тест массового начисления; повторный прогон | quality-scenarios.md |
| QS-02 | p99 регистрации платежа | quality-scenarios.md |
| QS-03 | импорт 100k строк + повторный импорт | quality-scenarios.md |
| QS-04 | конкурентный тест двух распределений на один счёт | quality-scenarios.md |
| QS-05 | тест изоляции тенантов (RLS + репозитории) | quality-scenarios.md |
| QS-06 | тест «каждое изменение → audit_event» | quality-scenarios.md |
| QS-07 | репетиция восстановления из бэкапа | quality-scenarios.md, scaling.md |
| QS-08 | SLO-мониторинг и алерты | scaling.md |
| QS-09 | расчёт 10× ёмкости и триггеры пересмотра | scaling.md |
| QS-10 | замер онбординга инженера | quality-scenarios.md |

## 5. Риски и ограничения

| ID | Риск / ограничение | Влияние | Владелец |
|---|---|---|---|
| R-01 | Допущение A-01 (организация vs частное лицо) не подтверждено | Границы MVP, не модель | Продукт |
| R-02 | `INV-10`: перевыставление счёта возможно только после `void`; правка действующего счёта запрещена (это осознанно) | Низкое | Архитектор |
| R-03 | `DM-A-04`: распределение накопительное и не уменьшается; исправление ошибочного распределения в MVP не описано | Среднее, есть обход через сторно вышестоящего документа | Архитектор |
| R-04 | Тариф хранится как `numeric(14,4)` — документированное исключение из «деньги = bigint» | Низкое | Домен |
| R-05 | Интеграции (банк, 1С) описаны контрактно, без реальных форматов | Среднее для реализации | Интеграции |
| R-06 | Мультивалютность зарезервирована, но не реализуется в MVP | Низкое | Продукт |
