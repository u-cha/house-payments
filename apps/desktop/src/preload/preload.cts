// Sandboxed preload не поддерживает ESM и не грузит локальные модули,
// поэтому файл самодостаточен и собирается в CommonJS (preload.cjs).
import type {
  AuthStatusResult,
  CreateOwnerInput,
  HousePaymentsApi,
  IpcResult,
  LoginInput,
  PingResult,
  ProfileDto,
  SessionDto,
} from '../shared/ipc.js';
import electron = require('electron');

// Каналы продублированы строками: preload не может импортировать shared.
const CHANNELS = {
  ping: 'app:ping',
  authStatus: 'auth:status',
  createOwner: 'auth:create-owner',
  login: 'auth:login',
  logout: 'auth:logout',
} as const;

const invoke = <T,>(channel: string, payload?: unknown): Promise<T> =>
  electron.ipcRenderer.invoke(channel, payload) as Promise<T>;

const api: HousePaymentsApi = {
  ping: () => invoke<PingResult>(CHANNELS.ping),
  authStatus: () => invoke<IpcResult<AuthStatusResult>>(CHANNELS.authStatus),
  createOwner: (input: CreateOwnerInput) =>
    invoke<IpcResult<ProfileDto>>(CHANNELS.createOwner, input),
  login: (input: LoginInput) => invoke<IpcResult<SessionDto>>(CHANNELS.login, input),
  logout: (sessionId: string) => invoke<IpcResult<null>>(CHANNELS.logout, sessionId),
};

electron.contextBridge.exposeInMainWorld('api', api);
