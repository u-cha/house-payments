# house-payments — проектное ядро

Каталог проектных артефактов личного приложения для учёта платежей за жильё:
квартиры, дома и машиноместа. Приложение настольное, локальное; данные — в одном
переносимом файле пользователя. Код приложения здесь не живёт: источник истины —
текст, диаграммы и модель генерируются из него.

Прежняя проработка (SaaS для управляющих компаний) сохранена в
[archive/saas-2026-11-04/](../../archive/saas-2026-11-04/design/README.md) и не
является действующей: продукт переопределён (A-01 в брифе).

## С чего начать

1. [brief.md](brief.md) — зачем продукт, границы, требования, критерии приёмки.
2. [domain/glossary.md](domain/glossary.md) — словарь; без него остальное читается неверно.
3. [domain/entities.md](domain/entities.md) и [domain/model.dbml](domain/model.dbml) — что храним.
4. [domain/invariants.md](domain/invariants.md) — что обязано быть верно всегда.
5. [architecture/core-modules.md](architecture/core-modules.md) — как устроено ядро.
6. [architecture/quality-scenarios.md](architecture/quality-scenarios.md) — что считаем качеством.
7. [architecture/adr/](architecture/adr/README.md) — почему приняты ключевые решения.
8. [ux/scenarios.md](ux/scenarios.md) — что делает человек.
9. [roadmap.md](roadmap.md) — вехи, эпики и декомпозиция работ.
10. [traceability.md](traceability.md) — связь требований с реализацией.
11. [risks.md](risks.md) — реестр рисков и закрытые решения по OQ-01…OQ-06.

## Карта артефактов

```
docs/design/
  brief.md                 границы, требования FR, критерии AC, допущения, OQ
  traceability.md          FR → модуль → сущность → инвариант → ADR → UX → проверка
  roadmap.md               вехи M0–M5, эпики E-01…E-15, зависимости, DoD
  risks.md                 R-01…R-10, решения и условия пересмотра
  domain/
    glossary.md            канонические термины
    entities.md            сущности и агрегаты, состояния, владельцы
    invariants.md          INV-01…INV-23 и способ принуждения
    model.dbml             модель данных (источник ERD)
    lifecycles/*.mmd       состояния квитанции, платежа, счёта, счётчика
  architecture/
    core-modules.md        стиль, модули, IPC, контракты, ошибки, транзакции
    quality-scenarios.md   QS-01…QS-12 с измеримыми порогами
    scaling.md             10× рост, сжатие вложений, триггеры пересмотра
    context.mmd            C4 L1 — приложение и внешние участники
    containers.mmd         C4 L2 — Electron, SQLite, системное хранилище
    components.mmd         C4 L3 — модули ядра
    adr/                   журнал решений ADR-0001…0012
  review/
    consistency-2026-11-04.md  ревью консистентности и принятые решения
  ux/
    scenarios.md           17 пользовательских сценариев
    screens.md             информационная архитектура и 27 экранов
    payment-flow.mmd       последовательность «платёж → распределение → баланс»
```

## Соглашения об идентификаторах

| Префикс | Что означает | Где определён |
|---|---|---|
| `C-01…` | Ограничения | [brief.md](brief.md) §3 |
| `FR-01…` | Функциональные требования | [brief.md](brief.md) §4 |
| `QS-01…` | Сценарии качества | [architecture/quality-scenarios.md](architecture/quality-scenarios.md) |
| `AC-01…` | Критерии приёмки | [brief.md](brief.md) §6 |
| `IP-01…` | Точки реализации | [brief.md](brief.md) §7 |
| `INV-01…` | Инварианты | [domain/invariants.md](domain/invariants.md) |
| `ADR-0001…` | Архитектурные решения | [architecture/adr/](architecture/adr/README.md) |
| `E-01…`, `M0…` | Эпики и вехи | [roadmap.md](roadmap.md) |
| `US-01…`, `S-01…` | Сценарии и экраны | [ux/](ux/scenarios.md) |
| `OQ-01…`, `A-01…`, `DM-A-…` | Открытые вопросы, допущения | [risks.md](risks.md) §3, [domain/entities.md](domain/entities.md) §9 |

Идентификаторы стабильны: удалённый номер не переиспользуется.

## Правило: текст — источник истины, картинка — производная

Диаграммы в `.mmd` и модель в `.dbml` коммитятся; `.svg`/`.png` генерируются
(`pnpm diagrams`) и не являются источником. Поэтому схема не может «устареть
отдельно от документа».

## Проверка артефактов

```bash
pnpm install
pnpm validate     # проверки согласованности: ссылки, ID, модель, ADR, диаграммы
pnpm test         # unit/regression-тесты самих проверок + прогон по репозиторию
pnpm check        # validate + test
pnpm diagrams     # рендер всех .mmd/.dbml в .svg/.png
```

Проверки — это fitness functions: они падают, если модель потеряла деньги
`INTEGER`, период стал свободной строкой, ADR лишился раздела «Решение», а
требование осталось без строки трассировки. Негативные тесты в `tests/`
доказывают, что проверки умеют падать, а не только зеленеть.

## Статус

Все артефакты — `proposed`: решение принимает владелец продукта. Риски и открытые
вопросы закрыты решениями пользователя 2026-11-04 — [risks.md](risks.md); порядок
эпиков зафиксирован решением OQ-01 (распознавание квитанций — в M2). Итоги ревью
консистентности и принятые решения — в
[review/consistency-2026-11-04.md](review/consistency-2026-11-04.md).
