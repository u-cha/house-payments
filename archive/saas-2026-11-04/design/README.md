# house-payments — проектное ядро

Каталог проектных артефактов приложения для учёта платежей, счетов и начислений
по квартирам, домам и машиноместам. Код приложения здесь не живёт: источник истины —
текст, диаграммы и модель генерируются из него.

## С чего начать

1. [brief.md](brief.md) — зачем продукт, границы, требования, критерии приёмки.
2. [domain/glossary.md](domain/glossary.md) — словарь; без него остальное читается неверно.
3. [domain/entities.md](domain/entities.md) и [domain/model.dbml](domain/model.dbml) — что храним.
4. [domain/invariants.md](domain/invariants.md) — что обязано быть верно всегда.
5. [architecture/core-modules.md](architecture/core-modules.md) — как устроено ядро.
6. [architecture/quality-scenarios.md](architecture/quality-scenarios.md) — что считаем качеством.
7. [ux/scenarios.md](ux/scenarios.md) — что делает человек.
8. [traceability.md](traceability.md) — связь требований с реализацией.

## Карта артефактов

```
docs/design/
  brief.md                 границы, требования FR, критерии AC, допущения
  traceability.md          FR → модуль → сущность → инвариант → ADR → проверка
  domain/
    glossary.md            канонические термины
    entities.md            агрегаты и сущности, состояния, владельцы
    invariants.md          INV-01…INV-20 и способ принуждения
    model.dbml             модель данных (источник ERD)
    lifecycles/*.mmd       состояния счёта, платежа, лицевого счёта
  architecture/
    core-modules.md        стиль, модули, контракты, ошибки, транзакции
    quality-scenarios.md   QS-01…QS-10 с измеримыми порогами
    scaling.md             10× рост, партиционирование, триггеры пересмотра
    context.mmd            C4 L1 — система и внешние участники
    containers.mmd         C4 L2 — контейнеры
    components.mmd         C4 L3 — модули финансового ядра
    adr/                   журнал решений ADR-0001…0008
  ux/
    scenarios.md           12 пользовательских сценариев
    screens.md             информационная архитектура и экраны
    payment-flow.mmd       последовательность «платёж → распределение»
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
| `US-01…`, `S-01…` | Сценарии и экраны | [ux/](ux/scenarios.md) |
| `OQ-01…`, `A-01…` | Открытые вопросы и допущения | [brief.md](brief.md) |

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

Проверки — это fitness functions: они падают, если модель потеряла `tenant_id`,
деньги стали дробными, ADR лишился раздела «Решение», а требование осталось без
строки трассировки. Негативные тесты в `tests/` доказывают, что проверки умеют
падать, а не только зеленеть.

## Статус

Все артефакты — `proposed`: решение принимает владелец продукта. Открытые
вопросы и допущения перечислены в [brief.md](brief.md) §8. Задача может дробиться
на потоки WS-01…WS-07 (см. §9 брифа).
