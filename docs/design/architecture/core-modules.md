# Ядро приложения: модули, границы, контракты

Статус: **proposed**. Основание: [brief.md](../brief.md), ADR-0001 (локальный
модульный монолит), ADR-0005 (транзакции и журнал изменений), ADR-0006 (профили и
доступ). Диаграммы: [context.mmd](context.mmd), [containers.mmd](containers.mmd),
[components.mmd](components.mmd).

## 1. Архитектурный стиль

Локальный модульный монолит: одно настольное приложение, один файл SQLite, жёсткие
границы модулей внутри главного процесса Electron. UI — тонкий клиент, который не
содержит бизнес-правил и не имеет прямого доступа к базе.

Почему так, а не сервер и не микросервисы: пользователь один (семья), данные лежат
на его устройстве, сеть не требуется, а финансовые операции требуют транзакционной
согласованности. Один процесс и одна база дают ACID без распределённых протоколов
(ADR-0001). Модульные границы выбраны так, чтобы позже можно было вынести
синхронизацию в отдельный контур, не переписывая модель (ADR-0011).

Правило зависимостей:

1. `shared` не зависит ни от чего.
2. Модуль может зависеть только от `shared` и от **публичных** контрактов других модулей.
3. Циклов между модулями нет; направление зависимостей проверяется тестом.
4. Модуль не читает таблицы другого модуля напрямую — только через порт или
   read-model, опубликованную владельцем.
5. Внутренние пакеты модуля (`domain/`, `application/`, `adapters/`) не экспортируются:
   снаружи виден только `api.ts`.
6. Renderer не импортирует ничего из `main/`; единственный канал — типизированный IPC.

## 2. Карта модулей

| Модуль | Ответственность | Владеет данными | Зависит от | Требования |
|---|---|---|---|---|
| `shared` | Деньги, период, идентификаторы, ошибки, часы, результат | — | — | C-02, C-03 |
| `identity` | Профиль владельца, вход, сессия; модель профилей/ролей готова к членам семьи | `profile`, `setting` | `shared` | FR-14, QS-05 |
| `catalog` | Помещения, поставщики, лицевые счета, услуги, тарифы; ссылки на личные кабинеты | `property`, `supplier`, `account`, `service`, `tariff` | `shared` | FR-01…FR-04, FR-19 |
| `metering` | Счётчики, показания, поверка, передача показаний | `meter`, `meter_reading`, `meter_verification` | `shared`, `catalog` | FR-09, FR-10 |
| `billing` | Начисления за период: ручной ввод, шаблон, из распознанной квитанции | `accrual` | `shared`, `catalog`, `metering` | FR-05 |
| `invoicing` | Квитанции, строки, фиксация, аннулирование | `invoice`, `invoice_line` | `shared`, `catalog`, `billing` | FR-06 |
| `payments` | Платежи, идемпотентность | `payment` | `shared`, `catalog` | FR-07, INV-22 |
| `ledger` | Распределение платежей, долг, переплата | `allocation`, `balance` | `shared`, `catalog`, `invoicing`, `payments` | FR-08 |
| `reminders` | Напоминания: оплата, показания, поверка | `reminder` | `shared`, `metering`, `invoicing` | FR-11 |
| `documents` | Вложения: сканы, фото, чеки | `attachment` | `shared`, `catalog` | FR-12 |
| `recognition` | Распознавание квитанций: OCR, правила, шаблоны поставщиков, модуль настройки шаблонов, подтверждение | `import_job`, `recognition_candidate`, `supplier_template` | `shared`, `catalog`, `documents`, `billing`, `invoicing` | FR-18, FR-20, QS-11, QS-12 |
| `reporting` | Отчёты и графики: чтение и агрегаты | `mv_expense_month`, `mv_debt_by_property`, `mv_service_dynamics` (read-model) | `shared` + журнал изменений | FR-13 |
| `portability` | Экспорт, импорт, резервные копии, миграции | `schema_version`, `device` | `shared`, все модули только на чтение через их `api.ts` | FR-16, QS-07 |
| `sync` | Синхронизация с облаком (зона развития) | `change_log` | `shared` + журнал изменений | FR-17, ADR-0011 |

`reporting`, `reminders` и `sync` — подписчики на журнал изменений: они не
вызываются синхронно из финансового контура и не могут влиять на его транзакцию.

`change_log` — общий журнал, но пишет в него **только транзакционный слой** через
порт `shared`; модули не работают с ним напрямую.

## 3. Слои внутри модуля

```
main/modules/<module>/
  domain/          сущности, value objects, инварианты, доменные события
  application/     use cases, порты (интерфейсы), DTO, обработчики
  adapters/        репозитории SQLite, миграции таблиц, файловые хранилища
  api.ts           единственная публичная точка: use cases, события, DTO
```

Домен не знает о SQLite, Electron и других модулях. Прикладной слой оркестрирует
use case и работает с портами. Адаптеры знают о технологиях, но не о бизнес-правилах.

UI (renderer) вызывает use cases через IPC-мост:

```
renderer (React) --IPC--> preload bridge --> main/ipc (Zod-валидация) --> api.ts модуля
```

IPC-контракт версионируется вместе с приложением; любая команда возвращает либо
результат, либо `AppError`. Renderer не формирует финансовые значения сам — только
отображает и передаёт ввод на валидацию.

## 4. Публичные контракты модулей

Контракт модуля — это use case (команда/запрос), событие и DTO. Ниже — ключевые
операции; полный список фиксируется в `api.ts` при реализации.

### catalog

| Use case | Вход | Гарантии |
|---|---|---|
| `CreateProperty` / `UpdateProperty` / `ArchiveProperty` | данные помещения | Помещение с историей не удаляется физически |
| `CreateSupplier` / `UpdateSupplier` | данные поставщика | Название не пустое; дубли предупреждаются |
| `OpenAccount` / `CloseAccount` | помещение, поставщик, номер | Нельзя закрыть при ненулевом долге (INV-12) |
| `UpdateAccountCabinet` | `cabinetUrl`, `cabinetNote` | Ссылка и памятка сохраняются; пустые значения допустимы (FR-19) |
| `SetTariff` | услуга, цена, `valid_from` | Пересечение периодов действия запрещено (INV-04) |

### metering

| Use case | Вход | Гарантии |
|---|---|---|
| `AddMeter` / `UpdateMeter` | счётчик, даты установки | Создаётся вместе с текущей поверкой (`meter_verification`) |
| `AddVerification` | `meterId`, `verifiedOn`, `validUntil`, `certificate?` | История поверок; последняя запись задаёт `meter.valid_until` (INV-15) |
| `RecordReading` | `meterId`, `period`, `value`, `takenOn`, `confirmDecrease?`, `reason?` | Одно показание на счётчик и период (INV-14); убывание — отказ без подтверждения, с подтверждением и причиной — аудит |
| `ReplaceMeter` | `oldMeterId`, новый счётчик, `replacedOn`, `initialValue` | Старый счётчик получает `retired_on`; новый создаётся с начальным показанием; аудит |
| `MarkSubmitted` | `readingId`, `submittedOn?`, `channel?` | Отметка не переписывает показание; `submission_marked_at` ставится автоматически, дата и способ — опционально; аудит |

### billing

| Use case | Вход | Гарантии |
|---|---|---|
| `RecordAccrual` | лицевой счёт, услуга, период, сумма | Деньги — целые копейки (INV-01); период `YYYY-MM` (INV-02) |
| `ImportAccruals` | файл/строки, `batchKey` | **После первой версии** (R-06): `batchKey` сохраняется в `import_job`; повторный импорт того же файла не создаёт дублей (INV-13, QS-03) |
| `ReverseAccrual` | `accrualId`, `reason`, автор | Создаёт связанную обратную запись; исходная остаётся (INV-11) |

### invoicing

| Use case | Вход | Гарантии |
|---|---|---|
| `DraftInvoice` | лицевой счёт, период | Сумма = сумма несторнированных начислений периода; строки ссылаются на начисления (INV-05) |
| `IssueInvoice` | `invoiceId`, `dueOn` | После фиксации содержимое неизменяемо (INV-05) |
| `VoidInvoice` | `invoiceId`, `reason` | Только без активных распределений (INV-06); после `void` возможен перевыпуск за тот же период (INV-03) |
| `ApplySettlement` | `invoiceId`, `deltaMinor`, `allocationId` | Только из `ledger` в общей транзакции; обновляет `paid`/статус, но не `total_minor` (INV-05) |

### payments

| Use case | Вход | Гарантии |
|---|---|---|
| `RegisterPayment` | лицевой счёт, сумма, дата, канал, `idempotencyKey` | Вставляет платёж; вызывается из `ledger.RegisterPaymentWithAllocation` в общей транзакции (INV-22); повтор возвращает существующий платёж (INV-13) |
| `ReversePayment` | `paymentId`, причина | Только после отмены активных распределений; обратная запись с аудитом |

### ledger

| Use case | Вход | Гарантии |
|---|---|---|
| `RegisterPaymentWithAllocation` | поля платежа + выбранные квитанции | Один UI-use case: платёж + распределения + баланс + аудит + журнал в одной транзакции (INV-22) |
| `AllocatePayment` | `paymentId`, `invoiceId`, сумма | Для последующего разнесения аванса; сумма ≤ платежа и ≤ остатка квитанции (INV-07, INV-08) |
| `ReverseAllocation` | `allocationId`, причина | Отмена распределения: деньги возвращаются в аванс, аудит и журнал (INV-06) |
| `AutoAllocate` | `paymentId`, стратегия `fifo_due_date` | Порядок: срок оплаты, затем период |
| `GetAccountBalance` | `accountId` | Баланс = начисления − распределения (INV-10) |

### identity / reminders / documents / portability

`CreateProfile`, `Authenticate`, `ChangePassword`;
`CreateReminder`, `DismissReminder`, `CompleteReminder`;
`AttachFile`, `RemoveAttachment`;
`ExportData`, `ImportData`, `CreateBackup`, `RestoreBackup`, `MigrateFile`.

В первой версии `identity` создаёт один профиль `owner`; `RevokeProfile` и управление
членами семьи — зона развития (модель профилей готова).

### recognition

| Use case | Вход | Гарантии |
|---|---|---|
| `StartRecognition` | `attachmentId`, `supplierId?` | Файл не покидает устройство; создаётся `import_job`; шаблон выбирается по поставщику |
| `GetCandidates` | `importJobId` | Все поля с уверенностью и координатами; низкая уверенность помечена |
| `CorrectCandidate` | `candidateId`, `value` | Исправление сохраняется в аудите; шаблон поставщика не меняется (R-10, без самообучения) |
| `ConfirmRecognition` | `importJobId`, подтверждённые поля и строки услуг | Создаёт начисления/квитанцию (source = `recognition`) в одной транзакции; аудит и журнал |
| `DismissRecognition` | `importJobId`, причина | Не создаёт финансовых записей |
| `CreateTemplate` | `supplierId`, `sampleAttachmentId`, `name`, `regions`, `rules` | Создаёт `supplier_template` версии 1; области нормализованы к странице; файл не покидает устройство; аудит |
| `UpdateTemplate` | `templateId`, `regions`, `rules` | Создаёт новую версию, старые не перезаписываются (INV-23); аудит |
| `PreviewTemplate` | `templateId`, `attachmentId` | Прогон шаблона на образце без создания финансовых документов; показывает распознанные поля и уверенность |

## 5. События и журнал изменений

Доменное событие пишется в `change_log` в той же транзакции, что и изменение
состояния. Отдельный диспетчер внутри процесса уведомляет подписчиков
(`reporting`, `reminders`), а `sync` позже доставляет журнал в облако.

Событие содержит `id`, `entityType`, `entityId`, `operation`, `payload`, `deviceId`,
`logicalClock`, `occurredAt`. Правила: append-only, версионирование схемы payload,
порядок в границах сущности по `logicalClock`, повторная обработка идемпотентна.

| Событие | Издатель | Потребители |
|---|---|---|
| `AccrualRecorded` | billing | reporting |
| `AccrualReversed` | billing | reporting |
| `InvoiceIssued` | invoicing | reminders, reporting |
| `InvoiceVoided` | invoicing | reporting |
| `PaymentRegistered` | payments | reporting |
| `PaymentAllocated` | ledger | invoicing, reporting |
| `ReadingRecorded` | metering | reminders, reporting |
| `ReadingSubmitted` | metering | reminders |
| `MeterVerificationDue` | metering | reminders |
| `RecognitionCompleted` | recognition | reporting |
| `AllocationReversed` | ledger | invoicing, reporting |
| `PaymentReversed` | payments | reporting |
| `MeterReplaced` | metering | reminders, reporting |
| `VerificationRecorded` | metering | reminders |

## 6. Модель ошибок

Единая иерархия; IPC-адаптер маппит тип ошибки в код ответа, домен о кодах не знает.

```ts
type ErrorCode =
  | 'VALIDATION_FAILED'   // некорректный ввод
  | 'UNAUTHENTICATED'     // требуется вход или сессия истекла
  | 'FORBIDDEN'           // роль не позволяет операцию
  | 'NOT_FOUND'           // объект не найден
  | 'CONFLICT'            // нарушено состояние или уникальность
  | 'BUSINESS_RULE'       // нарушен инвариант
  | 'STORAGE_FAILURE';    // ошибка файла данных или диска, retryable

interface AppError {
  code: ErrorCode;
  message: string;        // безопасно для пользователя, без PII
  details?: Record<string, unknown>;
  retryable: boolean;
  traceId: string;
}
```

Доменные коды (`details.reason`): `INVOICE_IMMUTABLE`,
`INVOICE_ALREADY_ISSUED`, `INVOICE_HAS_ALLOCATIONS`, `ALLOCATION_EXCEEDS_INVOICE`,
`ALLOCATION_EXCEEDS_PAYMENT`, `DUPLICATE_IDEMPOTENCY_KEY`, `ACCOUNT_CLOSED`,
`ACCOUNT_HAS_DEBT`, `TARIFF_OVERLAP`, `METER_READING_DECREASED`,
`METER_READING_DUPLICATE`, `VERIFICATION_EXPIRED`, `PROFILE_LAST_OWNER`,
`SCHEMA_VERSION_UNSUPPORTED`, `FILE_CORRUPTED`, `CONCURRENT_MODIFICATION`,
`REVERSAL_ALREADY_EXISTS`, `RECOGNITION_LOW_CONFIDENCE`, `IMPORT_NOT_CONFIRMED`,
`PAYMENT_WITHOUT_ALLOCATION`, `ALLOCATION_ALREADY_REVERSED`, `VERIFICATION_REQUIRED`,
`TEMPLATE_REGION_INVALID`, `TEMPLATE_VERSION_CONFLICT`.

Требования: сообщение не раскрывает внутренние пути и данные других профилей;
`CONCURRENT_MODIFICATION` всегда retryable с новым чтением; ошибка хранилища не
оставляет частичных записей (транзакция откатывается).

Правило маппинга неизвестных ошибок на границе IPC (`toAppError`):

- `AppError` передаётся без изменений — код и `traceId` уже выставлены вызывающим.
- Системный сбой файла данных/диска (`errno`: `ENOSPC`, `EIO`, `EBUSY`, `ENOENT`, …;
  SQLite: `SQLITE_BUSY`, `SQLITE_LOCKED`, `SQLITE_IOERR*`, `SQLITE_FULL`, …) →
  `STORAGE_FAILURE`, `retryable: true`: сбой среды, повтор после устранения причины
  может помочь.
- Остальное (программные `TypeError`/`RangeError`, `Error` без кода, `throw` не-`Error`) →
  `BUSINESS_RULE` (ближайший неретраибельный код закрытого списка), `retryable: false`:
  повтор того же вызова не поможет. Сырой текст наружу не отдаётся; диагностика — по
  `traceId` в журнале main-процесса.

`safeMessage` перед показом пользователю заменяет абсолютные пути, `file://`-ссылки,
e-mail, телефоны и токены (Bearer, API-ключи, JWT, длинные hex-секреты) на
плейсхолдеры `[path]`, `[email]`, `[phone]`, `[token]` и ограничивает сообщение
500 символами. Свободные имена и адреса, не выводимые из шаблона, фильтр не
распознаёт: use case обязан не строить текст сообщения из пользовательских данных
(C-04).

## 7. Транзакционные границы

SQLite работает в режиме WAL: много читателей, один писатель. Каждая операция
записи — одна транзакция; UI не видит промежуточного состояния.

| Операция | Граница | Механизм |
|---|---|---|
| `RegisterPaymentWithAllocation` | одна транзакция | `INSERT` платежа + выбранных распределений + `balance` + аудит + `change_log` (INV-22) |
| `AllocatePayment` / `ReverseAllocation` | одна транзакция | проверка остатков, вставка/отмена распределения, обновление `balance`, аудит, `change_log` |
| `ReversePayment` | одна транзакция | проверка отсутствия активных распределений, `reversed_at`, `balance`, аудит, `change_log` |
| `IssueInvoice` | одна транзакция | статус, `issued_at`, аудит, `change_log` |
| `ReplaceMeter` / `AddVerification` | одна транзакция | новый счётчик/поверка, начальное показание, аудит, `change_log` |
| `ImportAccruals` | батч по 1 000 строк | каждая порция — транзакция, прогресс и дедупликация по `batchKey` |
| `ConfirmRecognition` | одна транзакция | подтверждённые кандидаты → начисления/квитанция, аудит, журнал |
| `CreateTemplate` / `UpdateTemplate` | одна транзакция | новая версия `supplier_template` (старые не меняются, INV-23), аудит, `change_log` |
| `RestoreBackup` | файловая операция вне БД | проверка целостности, затем атомарная замена файла |

Межмодульные изменения внутри одной транзакции допускаются только по явному порту
владельца данных (например, `invoicing.ApplySettlement` вызывается из `ledger`).
Всё остальное — через журнал изменений после коммита.

## 8. Значения, идентификаторы, время

- `Money` — `{ amountMinor: bigint, currency: 'RUB' }`; сложение/вычитание только
  при совпадении валюты (C-02). Валюта одна, но тип не позволяет смешать её случайно.
- `Period` — `YYYY-MM`, сравнение лексикографически, `next()`/`previous()` (C-03);
  отдельного «закрытого периода» нет — править можно любой период.
- Идентификаторы — UUIDv7: сортируемость по времени, пригодность для синхронизации.
  Внутри одной миллисекунды `rand_a` используется как монотонный счётчик
  (RFC 9562, §6.2, повышенная точность времени), поэтому последовательные id строго
  возрастают; при исчерпании счётчика метка времени сдвигается на 1 мс вперёд.
- Время — ISO-8601 UTC в `TEXT`; `paid_on` — дата платежа, `created_at` — момент
  записи; они различаются и оба значимы.
- Показания счётчиков — `numeric(14,3)`; арифметика через десятичную строку, не float.

## 9. Профили и доступ

В первой версии один профиль `owner` (полный доступ). Модель профилей и ролей
готова к членам семьи: `member` — зона развития, права будут заданы отдельной
матрицей. Последний `owner` не может быть удалён или понижен (INV-16). Пароли —
Argon2id; сессия — в памяти процесса. Шифрование файла в первой версии не
выполняется (OQ-02 отложен); защита — вход по паролю и ОС.

Права проверяются в прикладном слое (use case), а не в UI и не в IPC-контроллере.

## 10. Структура репозитория приложения (целевая)

```
src/
  main/                       # Electron main process
    shared/                   # Money, Period, ids, errors, clock, change_log port
    modules/
      identity/  catalog/  metering/  billing/  invoicing/
      payments/  ledger/   reminders/ documents/ reporting/
      recognition/ portability/  sync/
    ipc/                      # контроллеры, Zod-схемы, маппинг ошибок
    infrastructure/           # SQLite, миграции, BLOB-вложения, бэкапы
    composition/              # composition root: сборка портов и адаптеров
  preload/                    # минимальный мост window.api
  renderer/                   # React-приложение, только UI и вызовы IPC
    features/  components/  styles/
  migrations/                 # SQL-миграции, только вперёд
tests/
  unit/  integration/  architecture/  e2e/
```

Архитектурные тесты (`tests/architecture/`) проверяют: отсутствие циклов, запрет
импорта внутренностей модуля, отсутствие SQL и импортов `main/` в renderer, наличие
`id` и `created_at` у финансовых таблиц.

## 11. Основной функционал (сквозные сценарии)

1. **Настройка**: профиль → помещения → поставщики → лицевые счета → услуги → тарифы.
2. **Учёт**: квитанция с фото/скана/PDF → локальное распознавание → подтверждение →
   начисления и квитанция; либо ручной ввод начислений за период → квитанция →
   фиксация. Импорт CSV — после первой версии (R-06).
3. **Оплата**: платёж → автоматическое распределение по квитанциям → при
   необходимости ручное; долг и переплата пересчитываются в той же транзакции.
4. **Счётчики**: установка и поверка → показание за период → отметка о передаче
   поставщику → напоминание о следующем сроке.
5. **Контроль**: отчёты и графики, долг по помещениям, расходы по услугам.
6. **Документы**: скан квитанции или чека прикрепляется к документу.
7. **Сохранность**: резервная копия, экспорт, перенос файла на другое устройство.
8. **Семья**: приглашение профиля, роли, аудит действий.
