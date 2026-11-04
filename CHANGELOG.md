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

### Changed

- Корневой `package.json` переименован в `house-payments` (монорепозиторий);
  добавлен скрипт `bootstrap`.
- `pnpm bootstrap` включает локальный `pre-push`-хук из `.githooks/`.
- Репозиторий переведён в публичный, на `main` включены форсируемые rulesets
  (PR, линейная история, запрет force-push и удаления), на теги `v*` — запрет
  удаления и перемещения ([ADR-0014](docs/design/architecture/adr/0014-public-repo-and-enforced-rules.md)).

## [0.1.0] — не выпущено (веха M0)

Первый тег появится, когда веха M0 будет готова: приложение устанавливается,
создаёт файл данных, входит по профилю, делает резервную копию.
