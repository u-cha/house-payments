# Changelog

Все заметные изменения проекта. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/). До 1.0
используется схема `0.x`.

## [Unreleased]

### Added

- Репозиторий проекта: один монорепозиторий для проектной документации и кода
  приложения, удалённый `origin` на GitHub ([ADR-0013](docs/design/architecture/adr/0013-repository-docs-and-versioning.md)).
- Правила работы для агентов и людей — [AGENTS.md](AGENTS.md).
- Вендоренные скиллы закреплены в [skills.lock.json](skills.lock.json) и
  восстанавливаются командой `pnpm bootstrap`.
- CI тестов на GitHub Actions: job `check` запускает `pnpm check` на Ubuntu на
  каждой ветке и PR ([ADR-0015](docs/design/architecture/adr/0015-ci-tests-and-status-polling.md)).
- Скрипт `pnpm ci:status` для опроса результатов CI: ветка/коммит/PR, ожидание,
  JSON и коды выхода для цикла доработок после тестов.
- Правило «свежий `main` перед пушем»: команда `pnpm sync:main` (fetch + merge
  `origin/main`), `pre-push`-хук и требование актуальной ветки в ruleset;
  смысловой конфликт выносится пользователю ([ADR-0017](docs/design/architecture/adr/0017-sync-main-before-push.md)).
- Правило итерации: каждая задача с изменениями кода завершается пересборкой
  приложения и ссылкой на артефакт в отчёте; артефакт лежит в известном месте
  `release/house-payments-mac-arm64-latest.dmg` ([ADR-0019](docs/design/architecture/adr/0019-iteration-artifact-and-link.md)).
- Экран объектов (S-04/S-05): список с поиском, фильтром по типу и архивом,
  форма создания и редактирования с валидацией, добавление типа через «+»,
  пустое состояние и обработка `AppError`; чтение и инвалидация — TanStack Query.
- Сессия и аудит catalog-команд: renderer передаёт `sessionId`, main отвечает
  `UNAUTHENTICATED` без активной сессии и пишет `audit_event` с `profileId`
  в одной транзакции с `change_log` (закрывает остаточные риски M0-10).

### Changed

- Корневой `package.json` переименован в `house-payments` (монорепозиторий);
  добавлен скрипт `bootstrap`.
- `pnpm bootstrap` включает локальный `pre-push`-хук из `.githooks/`.
- Репозиторий переведён в публичный, на `main` включены форсируемые rulesets
  (PR, линейная история, запрет force-push и удаления), на теги `v*` — запрет
  удаления и перемещения ([ADR-0014](docs/design/architecture/adr/0014-public-repo-and-enforced-rules.md)).
- macOS-сборка переименована в стабильное `release/house-payments-mac-arm64-latest.dmg`
  без версии в имени; `pnpm dist:mac` печатает путь и ссылку на артефакт.

## [0.1.0] — не выпущено (веха M0)

Первый тег появится, когда веха M0 будет готова: приложение устанавливается,
создаёт файл данных, входит по профилю, делает резервную копию.
