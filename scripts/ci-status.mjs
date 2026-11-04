#!/usr/bin/env node
// Опрос результатов CI (GitHub Actions) для процесса доработок после тестов.
//
// Решение и границы — docs/design/architecture/adr/0015-ci-tests-and-status-polling.md.
// Нужен авторизованный GitHub CLI: `gh auth status`. Секретов и токенов скрипт
// не читает и не печатает — авторизацию целиком берёт на себя gh.
//
// Примеры:
//   pnpm ci:status                       # последний прогон для текущей ветки
//   pnpm ci:status --branch main        # последний прогон ветки main
//   pnpm ci:status --commit <sha>       # прогон конкретного коммита
//   pnpm ci:status --pr 12              # прогон HEAD ветки пул-реквеста
//   pnpm ci:status --wait               # ждать завершения (по умолчанию 30 минут)
//   pnpm ci:status --wait=60 --json     # ждать, интервал опроса 60 с, JSON
//
// Коды выхода: 0 — успех, 1 — прогон завершился неуспешно, 2 — ещё идёт или
// прогон не найден, 64 — ошибка аргументов.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

/** Workflow, результаты которого опрашиваются. */
export const WORKFLOW_FILE = 'ci.yml';

export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_PENDING = 2;
export const EXIT_USAGE = 64;

const DEFAULT_LIMIT = 10;
const DEFAULT_INTERVAL_SECONDS = 10;
const DEFAULT_TIMEOUT_SECONDS = 30 * 60;

const USAGE = `Опрос результатов CI (GitHub Actions).

Использование:
  pnpm ci:status [--branch <имя> | --commit <sha> | --pr <номер>] [опции]

Опции:
  -b, --branch <имя>     ветка; по умолчанию текущая ветка git
      --commit <sha>     конкретный коммит (взаимоисключающе с --branch/--pr)
      --pr <номер>       HEAD ветки пул-реквеста GitHub
      --repo <o/r>       репозиторий (по умолчанию — из git/gh)
      --limit <n>        сколько последних прогонов смотреть, по умолчанию ${DEFAULT_LIMIT}
      --wait[=<сек>]     ждать завершения; интервал опроса, по умолчанию ${DEFAULT_INTERVAL_SECONDS} с
      --timeout <сек>    предел ожидания, по умолчанию ${DEFAULT_TIMEOUT_SECONDS} с
      --json             машинный вывод (JSON)
  -h, --help             эта справка

Коды выхода: 0 — успех, 1 — неуспех, 2 — идёт/не найден, 64 — ошибка аргументов.`;

/**
 * Разбирает аргументы командной строки.
 * @param {string[]} argv
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    branch: undefined,
    commit: undefined,
    pr: undefined,
    repo: undefined,
    limit: DEFAULT_LIMIT,
    wait: false,
    interval: DEFAULT_INTERVAL_SECONDS,
    timeout: DEFAULT_TIMEOUT_SECONDS,
    json: false,
    help: false,
  };

  const takeValue = (name, value) => {
    if (value === undefined || value.startsWith('-')) {
      throw new UsageError(`для ${name} нужно значение`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--wait') {
      options.wait = true;
    } else if (arg.startsWith('--wait=')) {
      options.wait = true;
      options.interval = positiveInt(arg.slice('--wait='.length), '--wait');
    } else if (arg === '-b' || arg === '--branch') {
      options.branch = takeValue(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--commit') {
      options.commit = takeValue(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--pr') {
      options.pr = positiveInt(takeValue(arg, argv[i + 1]), '--pr');
      i += 1;
    } else if (arg === '--repo') {
      options.repo = takeValue(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--limit') {
      options.limit = positiveInt(takeValue(arg, argv[i + 1]), '--limit');
      i += 1;
    } else if (arg === '--timeout') {
      options.timeout = positiveInt(takeValue(arg, argv[i + 1]), '--timeout');
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new UsageError(`неизвестный аргумент: ${arg}`);
    }
  }

  const targets = [options.branch, options.commit, options.pr].filter(
    (value) => value !== undefined,
  );
  if (targets.length > 1) {
    throw new UsageError('--branch, --commit и --pr взаимоисключающие');
  }

  return options;
}

/** Ошибка неверных аргументов; main превращает её в код 64. */
export class UsageError extends Error {}

function positiveInt(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new UsageError(`для ${name} нужно положительное целое, получено: ${value}`);
  }
  return number;
}

/**
 * Выбирает самый свежий прогон под цель. Прогоны ожидаются в формате
 * `gh run list --json`.
 * @param {Array<Record<string, any>>} runs
 * @param {{ branch?: string, commit?: string }} target
 */
export function selectRun(runs, target) {
  const matches = [...(runs ?? [])]
    .filter((run) => {
      if (target.branch !== undefined && run.headBranch !== target.branch) return false;
      if (target.commit !== undefined && run.headSha !== target.commit) return false;
      return true;
    })
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

  return matches[0] ?? null;
}

/** Код выхода по состоянию прогона. */
export function exitCodeForRun(run) {
  if (!run) return EXIT_PENDING;
  if (run.status !== 'completed') return EXIT_PENDING;
  return run.conclusion === 'success' ? EXIT_SUCCESS : EXIT_FAILURE;
}

/** Короткий sha коммита. */
export function shortSha(sha) {
  return String(sha ?? '').slice(0, 7);
}

/**
 * Человекочитаемое описание прогона.
 * @param {Record<string, any> | null} run
 */
export function formatRun(run) {
  if (!run) {
    return 'CI: прогоны не найдены.';
  }

  const lines = [
    `CI: run ${run.databaseId ?? '?'} «${run.workflowName ?? run.name ?? WORKFLOW_FILE}»`,
    `  ветка: ${run.headBranch ?? '?'} · коммит: ${shortSha(run.headSha)} · событие: ${run.event ?? '?'}`,
    `  статус: ${run.status ?? '?'}${run.conclusion ? ` · итог: ${run.conclusion}` : ''}`,
    `  ссылка: ${run.url ?? '—'}`,
  ];

  if (exitCodeForRun(run) === EXIT_FAILURE) {
    lines.push(`  логи упавшего прогона: gh run view ${run.databaseId} --log-failed`);
  } else if (exitCodeForRun(run) === EXIT_PENDING) {
    lines.push('  прогон ещё выполняется; добавьте --wait, чтобы дождаться итога.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Запуск и опрос
// ---------------------------------------------------------------------------

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function ghJson(args) {
  const stdout = gh(args);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`gh вернул не JSON: ${error.message}`);
  }
}

function gitBranch() {
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (branch === 'HEAD') {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    return { branch: undefined, commit: sha };
  }
  return { branch };
}

function resolveTarget(options) {
  if (options.commit !== undefined) {
    return { commit: options.commit };
  }

  if (options.pr !== undefined) {
    const pr = ghJson([
      'pr',
      'view',
      String(options.pr),
      ...(options.repo ? ['--repo', options.repo] : []),
      '--json',
      'headRefName,headRefOid,url',
    ]);
    return { branch: pr.headRefName, commit: pr.headRefOid };
  }

  if (options.branch !== undefined) {
    return { branch: options.branch };
  }

  return gitBranch();
}

function listRuns(options, target) {
  const commonArgs = [
    'run',
    'list',
    ...(options.repo ? ['--repo', options.repo] : []),
    '--limit',
    String(options.limit),
    '--json',
    'databaseId,workflowName,name,headBranch,headSha,status,conclusion,createdAt,url,event',
  ];

  const targetArgs = [];
  if (target.commit !== undefined) {
    targetArgs.push('--commit', target.commit);
  } else if (target.branch !== undefined) {
    targetArgs.push('--branch', target.branch);
  }

  const workflowArgs = [...commonArgs, '--workflow', WORKFLOW_FILE, ...targetArgs];

  try {
    return ghJson(workflowArgs);
  } catch (error) {
    // Workflow ещё не в ветке по умолчанию (первый прогон до merge): GitHub API
    // не находит его по имени. Тогда смотрим все прогоны и фильтруем локально.
    if (!/workflow .* not found|HTTP 404/i.test(String(error.stderr ?? error.message))) {
      throw error;
    }
    return ghJson([...commonArgs, ...targetArgs]);
  }
}

function describeTarget(target) {
  if (target.branch !== undefined) return `ветка ${target.branch}`;
  if (target.commit !== undefined) return `коммит ${shortSha(target.commit)}`;
  return 'последний прогон';
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`Ошибка аргументов: ${error.message}\n\n${USAGE}`);
      return EXIT_USAGE;
    }
    throw error;
  }

  if (options.help) {
    console.log(USAGE);
    return EXIT_SUCCESS;
  }

  let target;
  try {
    target = resolveTarget(options);
    const deadline = Date.now() + options.timeout * 1000;
    let run = selectRun(listRuns(options, target), target);

    while (options.wait && !(run && run.status === 'completed')) {
      if (Date.now() >= deadline) {
        console.error(
          run
            ? `Ожидание истекло (${options.timeout} с): прогон ${run.databaseId} всё ещё ${run.status}.`
            : `Ожидание истекло (${options.timeout} с): прогоны для ${describeTarget(target)} не появились.`,
        );
        if (options.json) {
          console.log(JSON.stringify({ run, exitCode: EXIT_PENDING }, null, 2));
        } else {
          console.log(formatRun(run));
        }
        return EXIT_PENDING;
      }

      console.error(
        run
          ? `[ci] ${describeTarget(target)}: ${run.status} (run ${run.databaseId}); опрос через ${options.interval} с`
          : `[ci] ${describeTarget(target)}: прогонов пока нет; опрос через ${options.interval} с`,
      );
      await sleep(options.interval * 1000);
      run = selectRun(listRuns(options, target), target);
    }

    const exitCode = exitCodeForRun(run);
    if (options.json) {
      console.log(JSON.stringify({ run, exitCode }, null, 2));
    } else {
      console.log(formatRun(run));
    }
    return exitCode;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      console.error('Не найден gh (GitHub CLI). Установите gh и выполните `gh auth login`.');
      return EXIT_FAILURE;
    }
    console.error(`Не удалось опросить CI: ${error.message ?? error}`);
    return EXIT_FAILURE;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}
