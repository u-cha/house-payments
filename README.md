# house-payments — проектирование

Личное приложение для учёта платежей, счетов и оплат по квартирам, домам и
машиноместам. Настольное, локальное; данные — в одном переносимом файле.
Квитанции можно вносить вручную или загружать фото, сканы и PDF с **локальным
распознаванием** и обязательным подтверждением. Этот репозиторий содержит
**только проектные артефакты**, не код приложения.

Прежняя проработка под SaaS для управляющих компаний сохранена в
[archive/saas-2026-11-04/](archive/saas-2026-11-04/design/README.md) и не является
действующей.

## Правило: текст — источник истины, картинка — производная

Всё, из чего принимаются решения, лежит текстом в git. Диаграммы рендерятся из
текста, а не рисуются руками. Поэтому схема не может «устареть отдельно от
документа».

| Артефакт | Источник (коммитим) | Производное (генерим) |
|---|---|---|
| Потоки, состояния, контексты | `docs/**/*.mmd` (Mermaid) | `.svg`, `.png` |
| Модель данных | `docs/**/*.dbml` (DBML) | ERD `.svg`/`.png`, SQL |
| Решения | `docs/design/architecture/adr/NNNN-*.md` | — |
| Спеки, глоссарий, инварианты, roadmap | `docs/design/**/*.md` | — |

## Рендер диаграмм

```bash
pnpm install          # один раз
pnpm diagrams         # все .mmd и .dbml под docs/  -> .svg + .png рядом с источником
pnpm diagrams:examples # то же для docs/design/_examples/
```

Нужен локальный Chrome — путь задан в [.tools/puppeteer-config.json](.tools/puppeteer-config.json).
PNG делается для показа в чате/просмотрщике, SVG — для вставки в документы.

## Проверка артефактов

```bash
pnpm validate   # ссылки, идентификаторы, DBML, ADR, диаграммы
pnpm test       # тесты самих проверок + прогон по репозиторию
pnpm check      # validate + test
```

## Методология: вендоренные скиллы

Скиллы ставятся в проект, а не глобально: источник — git-клон в `third_party/`,
видимость для агента — симлинк `.dsh/skills/<имя>` на папку скилла. DSH читает
скиллы проекта из `.dsh/skills/`; глобальные (`~/.dsh/skills`) остаются только
процессными.

Основной набор — подмножество [magnus919/agent-skills](https://github.com/magnus919/agent-skills)
(MIT), sparse checkout, коммит `4f03205`. Используется как справочники по
конкретным вопросам, а не как процесс:

- `software-architecture/` — характеристики, границы, tradeoff-записи
- `c4-diagramming/`, `mermaid-diagrams/` — как рисовать
- `adr-authoring/` — журнал решений
- `data-architect/` — модель данных, владение, глоссарий
- `api-design-and-evolution/`, `privacy-engineering`, `secure-software-engineering/`,
  `product-design-and-ux/` — на соответствующих фазах
- `programming-principles/` — выжимки по распределённым данным (DDIA)

Electron-разработка (приложение —
[ADR-0009](docs/design/architecture/adr/0009-cross-platform-desktop-and-installers.md),
стек — [ADR-0010](docs/design/architecture/adr/0010-implementation-stack.md)):

| Скилл | Источник | Лицензия | Что даёт |
|---|---|---|---|
| `electron-development` | [Mindrally/skills](https://github.com/Mindrally/skills/tree/main/electron-development) @ `7682ca7` | Apache-2.0 | базовые правила: main/preload/renderer, IPC, context isolation, CSP, сборка и автообновление |
| `desktop-ui-electron` | [agents-inc/skills](https://github.com/agents-inc/skills/tree/main/src/skills/desktop-ui-electron) @ `845a1f2` | MIT | окна без рамки и кастомный title bar, tray, меню, dock badge, vibrancy/Mica, kiosk, сохранение геометрии окна |

Обновление — `git -C third_party/<клон> pull`: клоны частичные (`--filter=blob:none`)
со sparse checkout, поэтому скачивается только нужная папка.

Добавить новый скилл:

```bash
git clone --filter=blob:none --sparse <repo-url> third_party/<repo>
git -C third_party/<repo> sparse-checkout set <path-to-skill>
ln -s ../../third_party/<repo>/<path-to-skill> .dsh/skills/<name>
```

Имя каталога в `.dsh/skills/` должно совпадать с `name` во frontmatter `SKILL.md`:
по нему скилл вызывается. Каталог без `SKILL.md` игнорируется.

Процессные скиллы (brainstorming, планы, ревью, проверка) — из superpowers в
`~/.dsh/skills`.

## Структура

```
docs/design/
  brief.md, traceability.md, roadmap.md
  _examples/        проверка рендер-пайплайна (не канон)
  domain/           глоссарий, сущности, инварианты, model.dbml, жизненные циклы
  architecture/     C4, сценарии качества, масштабирование, adr/
  ux/               сценарии использования, экраны
archive/            предыдущие проработки, не действующие
.dsh/skills/        симлинки на вендоренные скиллы (см. «Методология»)
third_party/        git-клоны источников скиллов (sparse checkout)
```

## Установка приложения (план)

Будущее приложение — Electron-установщик под Windows/macOS/Linux; Docker, сервер
и интернет не нужны. Решение и обоснование — ADR-0009, ADR-0010 в
[docs/design/architecture/adr/](docs/design/architecture/adr/README.md).
