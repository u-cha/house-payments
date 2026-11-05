/* global process */
// pnpm dev: собрать main/preload, поднять Vite dev server и открыть окно Electron.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'vite';

const shell = process.platform === 'win32';
const run = (command, args, env = process.env) =>
  spawn(command, args, { stdio: 'inherit', env, shell });

const tsc = run('tsc', ['-p', 'tsconfig.node.json']);
const [code] = await once(tsc, 'exit');
if (code !== 0) process.exit(code ?? 1);

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local?.[0];
if (!url) throw new Error('Vite dev server did not expose a local URL');

// Аргументы после `--` уходят Electron, например --remote-debugging-port=9222.
const extraArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const electronEnv = { ...process.env, VITE_DEV_SERVER_URL: url };
// Иначе Electron стартует как обычный Node-процесс и окно не открывается.
delete electronEnv.ELECTRON_RUN_AS_NODE;
const electron = run('electron', [...extraArgs, '.'], electronEnv);

electron.on('exit', (electronCode) => {
  void server.close();
  process.exit(electronCode ?? 0);
});

process.on('SIGINT', () => electron.kill('SIGINT'));
