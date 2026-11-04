# Ядро приложения: модули, границы, контракты

Статус: **proposed**. Основание: [brief.md](../brief.md), ADR-0001 (модульный монолит),
ADR-0005 (транзакции и outbox). Диаграммы: [context.mmd](context.mmd),
[containers.mmd](containers.mmd), [components.mmd](components.mmd).

## 1. Архитектурный стиль

Модульный монолит: один деплой, одна база PostgreSQL, жёсткие границы модулей
внутри процесса. Микросервисы не оправданы: команда мала, объёмы умеренные,
финансовые операции требуют транзакционной согласованности, а стоимость
распределённых транзакций превышает выгоду независимого деплоя. Границы модулей
выбраны так, чтобы выделение сервиса позже было возможно без переписывания модели
(см. ADR-0001, раздел «Условия пересмотра»).

Правило зависимостей:

1. `shared` не зависит ни от чего.
2. Модуль может зависеть только от `shared` и от **публичных** контрактов других модулей.
3. Циклов между модулями нет; направление зависимостей проверяется тестом.
4. Модуль не читает таблицы другого модуля напрямую — только через порт или
   read-model, опубликованную владельцем.
5. Внутренние пакеты модуля (`domain/`, `application/`, `adapters/`) не экспортируются:
   снаружи виден только `api.ts`.

## 2. Карта модулей

| Модуль | Ответственность | Владеет данными | Зависит от | Требования |
|---|---|---|---|---|
| `shared` | Деньги, период, идентификаторы, ошибки, часы, outbox-механика | — | — | C-02, C-03 |
| `identity` | Организации, пользователи, членство, роли, политика доступа | `tenant`, `app_user`, `membership`, `role` | `shared` | FR-12, QS-05 |
| `registry` | Дома, помещения, лицевые счета, плательщики и связи | `building`, `property`, `account`, `payer`, `payer_property` | `shared` | FR-01, FR-02 |
| `tariffs` | Услуги и версионируемые тарифы | `service`, `tariff` | `shared`, `registry` | FR-03 |
| `billing` | Расчётные периоды, начисления, массовые прогоны, сторно начислений | `period_run`, `accrual` | `shared`, `registry`, `tariffs` | FR-04, FR-10 |
| `invoicing` | Счета, строки, выставление, аннулирование, состояние оплаты | `invoice`, `invoice_line` | `shared`, `registry`, `billing` | FR-05, FR-10 |
| `payments` | Платежи, идемпотентность, импорт выписки, сверка | `payment`, `import_batch`, `reconciliation_item` | `shared`, `registry` | FR-06, FR-07, FR-09 |
| `ledger` | Распределение платежей, аванс, выписка по лицевому счёту | `allocation`, `account_balance` | `shared`, `registry`, `invoicing`, `payments` | FR-08, FR-09 |
| `reporting` | Read-model отчёты: начисления, поступления, дебиторка | `mv_*` (материализованные представления) | `shared` + события | FR-14 |
| `notifications` | Уведомления о выставлении счёта и поступлении платежа | `notification` | `shared` + события | FR-11 |
| `integrations` | Адаптеры: банковские выписки, эквайринг, экспорт в 1С | — (только порты и адаптеры) | `payments`, `invoicing`, `reporting` | FR-07, FR-16 |

`reporting` и `notifications` — подписчики на события; они не вызываются синхронно
из финансового контура и не могут влиять на его транзакцию.

## 3. Слои внутри модуля

```
modules/<module>/
  domain/          сущности, value objects, инварианты, доменные события
  application/     use cases, порты (интерфейсы), DTO, обработчики событий
  adapters/        PostgreSQL-репозитории, HTTP-контроллеры модуля, внешние шлюзы
  api.ts           единственная публичная точка: use cases + события + DTO
```

Домен не знает о PostgreSQL, HTTP и других модулях. Прикладной слой orchestrates
use case и работает с портами. Адаптеры знают о технологиях, но не о бизнес-правилах.

## 4. Публичные контракты модулей

Контракт модуля — это use case (команда/запрос), событие и DTO. Ниже — ключевые
операции финансового контура и их предусловия/постусловия.

### billing

| Use case | Вход | Гарантии |
|---|---|---|
| `RunAccruals` | `tenantId`, `period`, `serviceIds[]`, `mode: draft\|post`, `idempotencyKey` | Повторный запуск с тем же ключом не создаёт дублей; начисления за период не перезаписываются, а сторнируются (INV-09) |
| `ReverseAccrual` | `accrualId`, `reason`, `actorId` | Создаёт связанную обратную запись; исходная остаётся |
| `GetAccruals` | `tenantId`, `period?`, `accountId?` | Только чтение |

### invoicing

| Use case | Вход | Гарантии |
|---|---|---|
| `IssueInvoices` | `tenantId`, `period`, `accountIds[]`, `dueOn` | Сумма счёта = сумма несторнированных начислений периода; повторное выставление при наличии действующего счёта отклоняется, после `void` — разрешено (INV-10) |
| `VoidInvoice` | `invoiceId`, `reason` | Разрешено только для `issued` без распределений (INV-11) |
| `ApplySettlement` | `invoiceId`, `deltaMinor`, `allocationId` | Только из `ledger` в рамках общей транзакции; обновляет `paid_minor` и состояние |

### payments

| Use case | Вход | Гарантии |
|---|---|---|
| `RegisterPayment` | `tenantId`, `accountId`, `amountMinor`, `paidAt`, `channel`, `externalRef?`, `idempotencyKey` | Ключ уникален в границах тенанта; повтор возвращает существующий платёж (INV-13) |
| `ImportStatement` | `tenantId`, `source`, `rows[]`, `batchKey` | Повторный импорт того же файла не создаёт новых платежей (QS-03) |
| `ReconcileItem` | `itemId`, `paymentId` | Расхождение фиксируется, а не замалчивается |

### ledger

| Use case | Вход | Гарантии |
|---|---|---|
| `AllocatePayment` | `paymentId`, `invoiceId`, `amountMinor`, `mode` | Сумма распределений не превышает ни платёж, ни остаток счёта (INV-14, INV-15); конкурентные вызовы сериализуются |
| `AutoAllocate` | `paymentId`, `strategy: fifo_due_date` | Распределяет по счетам в порядке срока оплаты, затем периода |
| `GetAccountStatement` | `accountId`, `from`, `to?` | Баланс = начисления + пени − распределения |

### registry / tariffs / identity

`CreateAccount`, `CloseAccount`, `AttachPayer`, `ChangeTariff`, `CreateMembership`,
`RevokeMembership`. Закрытие счёта запрещено при ненулевом балансе (INV-08).

## 5. События и outbox

Событие публикуется в `outbox_event` в той же транзакции, что и изменение состояния;
отдельный воркер доставляет его подписчикам. Событие содержит `eventId`, `tenantId`,
`occurredAt`, `type`, `version`, `payload` и `causationId`/`correlationId`.

| Событие | Издатель | Потребители |
|---|---|---|
| `AccrualPosted` | billing | reporting, invoicing |
| `AccrualReversed` | billing | reporting, invoicing |
| `InvoiceIssued` | invoicing | notifications, reporting |
| `InvoiceSettled` | invoicing | reporting |
| `InvoiceVoided` | invoicing | reporting |
| `PaymentRegistered` | payments | reporting, notifications |
| `PaymentAllocated` | ledger | reporting, invoicing |
| `ReconciliationCompleted` | payments | reporting |

Правила: события версионируются, аддитивны и не содержат персональных данных
сверх необходимого (C-04). Повторная доставка допустима — потребители идемпотентны.

## 6. Модель ошибок

Единая иерархия; HTTP-адаптер маппит тип ошибки в статус, домен о статусах не знает.

```ts
type ErrorCode =
  | 'VALIDATION_FAILED'      // 400 — некорректный ввод
  | 'UNAUTHENTICATED'        // 401
  | 'FORBIDDEN'              // 403 — нет роли/чужой тенант
  | 'NOT_FOUND'              // 404
  | 'CONFLICT'               // 409 — нарушено состояние/уникальность
  | 'BUSINESS_RULE'          // 422 — нарушен инвариант
  | 'EXTERNAL_FAILURE';      // 502/503 — внешний источник, retryable

interface AppError {
  code: ErrorCode;
  message: string;           // безопасно для пользователя, без PII
  details?: Record<string, unknown>;
  retryable: boolean;
  traceId: string;
}
```

Доменные коды (`details.reason`): `PERIOD_CLOSED`, `INVOICE_IMMUTABLE`,
`INVOICE_ALREADY_ISSUED`, `ALLOCATION_EXCEEDS_INVOICE`, `ALLOCATION_EXCEEDS_PAYMENT`,
`DUPLICATE_IDEMPOTENCY_KEY`, `ACCOUNT_CLOSED`, `ACCOUNT_HAS_BALANCE`,
`TENANT_MISMATCH`, `TARIFF_MISSING`, `CURRENCY_MISMATCH`, `CONCURRENT_MODIFICATION`,
`REVERSAL_ALREADY_EXISTS`.

Требования: ошибка никогда не раскрывает существование объекта чужого тенанта
(`NOT_FOUND`, не `FORBIDDEN` — QS-05); `CONCURRENT_MODIFICATION` всегда retryable
для клиента с новым чтением; внешние сбои не оставляют частичных записей.

## 7. Транзакционные границы

| Операция | Граница | Механизм |
|---|---|---|
| `RegisterPayment` | одна транзакция | `INSERT` платежа + аудит + outbox |
| `AllocatePayment` | одна транзакция | блокировка счёта `SELECT … FOR UPDATE`, вставка распределения, обновление остатков, outbox |
| `IssueInvoices` | батч по 500 счетов | каждая порция — транзакция, прогресс в `period_run` |
| `ImportStatement` | батч по 1 000 строк | дедупликация по `batchKey` + `externalRef` |
| `ReconcileItem` | одна транзакция | сопоставление + аудит |

Межмодульные изменения внутри одной транзакции допускаются только по явному
порту владельца данных (например, `invoicing.ApplySettlement` вызывается из
`ledger`). Всё остальное — через события после коммита.

## 8. Значения, идентификаторы, время

- `Money` — `{ amountMinor: bigint, currency: 'RUB' }`; сложение/вычитание только
  при совпадении валюты, иначе `CURRENCY_MISMATCH` (C-02).
- `Period` — `YYYY-MM`, сравнение лексикографически, `next()/previous()`; период
  закрывается явно (`PeriodClosed`) и после этого неизменяем (C-03).
- Идентификаторы — UUIDv7 (сортируемость по времени, отсутствие утечки объёма).
- Время — `timestamptz` в UTC; `paid_at` — момент поступления денег, `recorded_at`
  — момент записи в систему; они различаются и оба значимы.
- Ставки и тарифы хранятся как `numeric(14,4)` цена за единицу, но итоговая сумма
  начисления округляется до копейки детерминированно (`ROUND_HALF_UP`).

## 9. Мультитенантность и доступ

Каждая таблица, кроме глобальных справочников, содержит `tenant_id` (NOT NULL).
Доступ к данным — только через репозитории, которые подставляют `tenant_id` из
контекста запроса; в PostgreSQL дополнительно включён Row-Level Security как
защита в глубину. Роли: `admin`, `accountant`, `cashier`, `resident`, `auditor`.
Права проверяются в прикладном слое, а не в контроллере и не в UI.

## 10. Структура репозитория приложения (целевая)

```
src/
  shared/                     # ядро: Money, Period, ids, errors, clock, outbox
  modules/
    identity/  registry/  tariffs/  billing/
    invoicing/ payments/  ledger/   reporting/
    notifications/        integrations/
  http/                       # контроллеры, схемы валидации, маппинг ошибок
  workers/                    # outbox relay, планировщик начислений, импорт
  composition/                # composition root: сборка портов и адаптеров
  migrations/                 # SQL-миграции
tests/
  unit/  integration/  architecture/  contract/
```

Архитектурные тесты (`tests/architecture/`) проверяют: отсутствие циклов,
запрет импорта внутренностей модуля, отсутствие прямых SQL-запросов к чужим
таблицам, наличие `tenant_id` в каждой финансовой таблице.

## 11. Основной функционал (сквозные сценарии)

1. **Настройка**: организация → дома → помещения → лицевые счета → плательщики →
   услуги → тарифы.
2. **Начисление**: запуск за период → черновик → проверка → проводка (post).
3. **Выставление**: формирование счетов на период, фиксация срока оплаты.
4. **Оплата**: ручная регистрация / импорт выписки / вебхук эквайринга →
   автоматическое распределение → при необходимости ручное.
5. **Исправление**: сторно начисления/счёта с причиной; повторный счёт.
6. **Контроль**: отчёты, дебиторская задолженность, расхождения сверки, аудит.
7. **Самообслуживание**: житель видит свои начисления, счета и платежи.
