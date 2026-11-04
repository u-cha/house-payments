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

### Changed

- Корневой `package.json` переименован в `house-payments` (монорепозиторий);
  добавлен скрипт `bootstrap`.

## [0.1.0] — не выпущено (веха M0)

Первый тег появится, когда веха M0 будет готова: приложение устанавливается,
создаёт файл данных, входит по профилю, делает резервную копию.
