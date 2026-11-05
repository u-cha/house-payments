# house-payments

Личное приложение для учёта платежей, счетов и оплат по квартирам, домам и
машиноместам. Настольное, локальное; данные — в одном переносимом файле.
Квитанции можно вносить вручную или загружать фото, сканы и PDF с **локальным
распознаванием** и обязательным подтверждением.

Репозиторий — **монорепо проекта**: проектная документация и код приложения живут
вместе и версионируются одним тегом. Решение, структура и правила —
[ADR-0013](docs/design/architecture/adr/0013-repository-docs-and-versioning.md).
Код появится в `apps/desktop/` начиная с вехи M0 (эпик E-01)
([roadmap](docs/design/roadmap.md)); первая запускаемая версия — гейт V0 после
задачи M0-02. Сейчас в репозитории — проектные артефакты и инструменты их проверки.

Прежняя проработка под SaaS для управляющих компаний сохранена в
[archive/saas-2026-11-04/](archive/saas-2026-11-04/design/README.md) и не является
действующей.

## Быстрый старт

```bash
git clone git@github.com:u-cha/house-payments.git
cd house-payments
pnpm install          # зависимости инструментов документации
pnpm bootstrap        # восстановить third_party/ и .dsh/skills/ (см. «Скиллы»)
pnpm check            # validate + тесты: обязательная проверка перед PR
```

Требования: Node.js 22+, pnpm, git. Для рендера диаграмм — локальный Chrome
(см. ниже).

## Структура

```
docs/design/        проектные артефакты: бриф, ADR, домен, архитектура, UX, roadmap
archive/            прежние проработки, не действующие
apps/desktop/       код приложения (Electron: main/preload/renderer) — с E-01
packages/           общие пакеты pnpm-воркспейса — по мере появления
scripts/, tests/    проверки артефактов и рендер диаграмм
skills.lock.json    закреплённые версии вендоренных скиллов
.dsh/skills/        симлинки на скиллы проекта (создаёт pnpm bootstrap)
third_party/        клоны чужих репозиториев — не в git, восстанавливаются бутстрапом
```

Что где можно менять и какие правила обязательны — [AGENTS.md](AGENTS.md). Кратко:
код — только в `apps/`/`packages/`, проектные решения — только в `docs/`; в `main`
напрямую не коммитят.

## Документация

Вся проектная документация — в репозитории и версионируется вместе с кодом: тег
релиза фиксирует одновременно состояние кода и решений, поэтому они не могут
разъехаться. Точка входа — [docs/design/README.md](docs/design/README.md):
бриф, глоссарий, модель данных, инварианты, архитектура, ADR, UX, roadmap,
трассировка, риски.

Правило: **текст — источник истины, картинка — производная**. Всё, из чего
принимаются решения, лежит текстом в git; диаграммы рендерятся из текста, а не
рисуются руками. Поэтому схема не может «устареть отдельно от документа».

| Артефакт | Источник (коммитим) | Производное (генерим) |
|---|---|---|
| Потоки, состояния, контексты | `docs/**/*.mmd` (Mermaid) | `.svg`, `.png` |
| Модель данных | `docs/**/*.dbml` (DBML) | ERD `.svg`/`.png`, SQL |
| Решения | `docs/design/architecture/adr/NNNN-*.md` | — |
| Спеки, глоссарий, инварианты, roadmap | `docs/design/**/*.md` | — |

ADR после принятия не переписываются: новое решение — новый ADR со ссылкой
«Заменяет: ADR-NNNN». Пользовательская документация (установка, руководство)
появится в `docs/user/` в E-12.

## Как ведётся git

- Репозиторий публичный (ADR-0014); `main` защищён rulesets на GitHub: прямые
  коммиты и force-push невозможны, только через pull request. Правила и причина
  публичности — [ADR-0014](docs/design/architecture/adr/0014-public-repo-and-enforced-rules.md).
- Ветка: `<тип>/<id-задачи>-<слаг>`, например `feat/t-mw…-invoice-draft`.
- Коммиты — Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, …), в теле
  строка `Task: <id>`.
- Перед пушем — свежий `main`: `pnpm sync:main` (fetch + merge `origin/main`,
  без rebase), затем `pnpm check`. Конфликты разрешаются вручную; если непонятно,
  чья версия верна, — вопрос пользователю, а не `--ours`/`--theirs`. `pnpm bootstrap`
  включает `pre-push`-хук, который не пускает пуш ветки без свежего `main`
  ([ADR-0017](docs/design/architecture/adr/0017-sync-main-before-push.md)).
- PR: что/зачем/как проверено/риски; зелёный `pnpm check` и job CI `check`;
  squash-merge, ветка удаляется. Merge подтверждает владелец репозитория.
- Версии — аннотированные теги `vX.Y.Z` на `main` и GitHub Releases; изменения —
  [CHANGELOG.md](CHANGELOG.md). До 1.0 — `0.x`; вехи roadmap: M0 `v0.1.0`,
  M1 `v0.2.0`, M2 `v0.3.0`, M3 `v0.4.0`, M4 `v1.0.0`.
- CI тестов уже работает: job `check` на Ubuntu на каждом PR в `main` и по ручному
  запуску; опрос — `pnpm ci:status` (ADR-0016). Матрица трёх ОС (macOS —
  разработка, Windows и Linux — использование) и установщики — эпик E-12.

## Проверка артефактов

```bash
pnpm validate           # ссылки, идентификаторы, DBML, ADR, диаграммы
pnpm test               # тесты самих проверок + прогон по репозиторию
pnpm check              # validate + test
pnpm diagrams           # все .mmd и .dbml под docs/ -> .svg + .png рядом с источником
pnpm diagrams:examples  # то же для docs/design/_examples/
```

Проверки — fitness functions: падают, если модель потеряла деньги `INTEGER`,
период стал свободной строкой, ADR лишился раздела «Решение», а требование
осталось без строки трассировки. Негативные тесты в `tests/` доказывают, что
проверки умеют падать, а не только зеленеть.

Для рендера нужен локальный Chrome — путь задан в
[.tools/puppeteer-config.json](.tools/puppeteer-config.json). PNG — для показа в
чате/просмотрщике, SVG — для вставки в документы.

## CI и опрос результатов

Проверки запускаются на каждый pull request в `main`: workflow
[ci.yml](.github/workflows/ci.yml), job `check` — установка зависимостей и
`pnpm check` на Ubuntu. Устройство и границы — [ADR-0016](docs/design/architecture/adr/0016-ci-triggers-on-pull-request.md);
матрица macOS/Windows/Linux появится вместе с кодом приложения (E-01/E-12).
Ветку без PR проверяют ручным запуском: `gh workflow run ci.yml --ref <ветка>`.

```bash
pnpm ci:status                  # последний прогон текущей ветки
pnpm ci:status --wait           # дождаться завершения (по умолчанию 30 минут)
pnpm ci:status --pr 12 --wait   # прогон HEAD пул-реквеста
pnpm ci:status --json           # машинный вывод
```

Коды выхода: `0` — успех, `1` — прогон упал, `2` — идёт или не найден, `64` —
ошибка аргументов. Для упавшего прогона скрипт подсказывает
`gh run view <id> --log-failed`. Нужен авторизованный `gh` (`gh auth status`);
секретов скрипт не читает.

## Скиллы проекта (вендоренные)

Скиллы ставятся в проект, а не глобально: источник — частичный git-клон в
`third_party/`, видимость для агента — симлинк `.dsh/skills/<имя>` на папку
скилла. DSH читает скиллы проекта из `.dsh/skills/`; глобальные (`~/.dsh/skills`)
остаются только процессными.

`third_party/` не коммитится. Источник истины — [skills.lock.json](skills.lock.json):
репозиторий, sparse-пути, коммит, лицензия. `pnpm bootstrap` клонирует недостающее,
переключает на закреплённый коммит и пересоздаёт симлинки. Обновление скилла —
изменить коммит в `skills.lock.json`, выполнить `pnpm bootstrap`, проверить, что
скилл загружается, и закоммитить изменение вместе с пересозданными симлинками.

| Набор | Что даёт | Лицензия |
|---|---|---|
| [magnus919/agent-skills](https://github.com/magnus919/agent-skills) | `software-architecture`, `c4-diagramming`, `mermaid-diagrams`, `adr-authoring`, `data-architect`, `programming-principles` и др. — справочники по конкретным вопросам | MIT |
| [Mindrally/skills](https://github.com/Mindrally/skills/tree/main/electron-development) | `electron-development`: main/preload/renderer, IPC, context isolation, CSP, сборка | Apache-2.0 |
| [agents-inc/skills](https://github.com/agents-inc/skills/tree/main/src/skills/desktop-ui-electron) | `desktop-ui-electron`: окна без рамки, title bar, tray, меню, vibrancy/Mica | MIT |

Имя каталога в `.dsh/skills/` должно совпадать с `name` во frontmatter
`SKILL.md`: по нему скилл вызывается. Каталог без `SKILL.md` игнорируется.
Процессные скиллы (brainstorming, планы, ревью, проверка) — из superpowers в
`~/.dsh/skills`. На Windows симлинки требуют режима разработчика или WSL; CI эти
скиллы не использует.

## Установка приложения (план)

Будущее приложение — Electron-установщик под Windows/macOS/Linux; Docker, сервер
и интернет не нужны. Решение и обоснование — ADR-0009, ADR-0010 в
[docs/design/architecture/adr/](docs/design/architecture/adr/README.md).

### Черновая `.dmg` для macOS (без подписи)

Пока сертификатов нет (R-04), macOS-сборка — неподписанный черновик для
локальной проверки:

```bash
pnpm dist:mac          # arm64 .dmg в release/ (единственный каталог, ADR-0018)
open release/house-payments-*-arm64.dmg
```

Перетащите `house-payments.app` в `/Applications` и запустите. Сборка не
подписана и не нотаризована, поэтому Gatekeeper может её заблокировать. Тогда:

- правый клик по `house-payments.app` → **Открыть** → **Открыть** в диалоге; или
- снять карантин и запустить обычным двойным кликом:

  ```bash
  xattr -d com.apple.quarantine /Applications/house-payments.app
  ```

Повторный `pnpm dist:mac` очищает `release/` и перезаписывает артефакт: рядом не
копится история версий. Сам каталог `release/` в `.gitignore`; Windows/Linux,
подписанные и CI-сборки — вне этой задачи (M0-13).
