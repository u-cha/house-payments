// Sandboxed preload не поддерживает ESM и не грузит локальные модули,
// поэтому файл самодостаточен и собирается в CommonJS (preload.cjs).
import type {
  AuthStatusResult,
  CreateOwnerInput,
  CreatePropertyInput,
  CreatePropertyTypeInput,
  HousePaymentsApi,
  IpcResult,
  ListPropertiesInput,
  ListPropertyTypesInput,
  LoginInput,
  PingResult,
  ProfileDto,
  PropertyDto,
  PropertyTypeDto,
  SessionDto,
  UpdatePropertyInput,
  UpdatePropertyTypeInput,
} from '../shared/ipc.js';
import electron = require('electron');

// Каналы продублированы строками: preload не может импортировать shared.
const CHANNELS = {
  ping: 'app:ping',
  authStatus: 'auth:status',
  createOwner: 'auth:create-owner',
  login: 'auth:login',
  logout: 'auth:logout',
  quit: 'app:quit',
  listPropertyTypes: 'catalog:property-type:list',
  createPropertyType: 'catalog:property-type:create',
  updatePropertyType: 'catalog:property-type:update',
  createProperty: 'catalog:property:create',
  updateProperty: 'catalog:property:update',
  archiveProperty: 'catalog:property:archive',
  restoreProperty: 'catalog:property:restore',
  getProperty: 'catalog:property:get',
  listProperties: 'catalog:properties:list',
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
  listPropertyTypes: (sessionId: string, input?: ListPropertyTypesInput) =>
    invoke<IpcResult<PropertyTypeDto[]>>(CHANNELS.listPropertyTypes, {
      sessionId,
      input: input ?? {},
    }),
  createPropertyType: (sessionId: string, input: CreatePropertyTypeInput) =>
    invoke<IpcResult<PropertyTypeDto>>(CHANNELS.createPropertyType, { sessionId, input }),
  updatePropertyType: (sessionId: string, input: UpdatePropertyTypeInput) =>
    invoke<IpcResult<PropertyTypeDto>>(CHANNELS.updatePropertyType, { sessionId, input }),
  createProperty: (sessionId: string, input: CreatePropertyInput) =>
    invoke<IpcResult<PropertyDto>>(CHANNELS.createProperty, { sessionId, input }),
  updateProperty: (sessionId: string, input: UpdatePropertyInput) =>
    invoke<IpcResult<PropertyDto>>(CHANNELS.updateProperty, { sessionId, input }),
  archiveProperty: (sessionId: string, id: string) =>
    invoke<IpcResult<PropertyDto>>(CHANNELS.archiveProperty, { sessionId, input: id }),
  restoreProperty: (sessionId: string, id: string) =>
    invoke<IpcResult<PropertyDto>>(CHANNELS.restoreProperty, { sessionId, input: id }),
  getProperty: (sessionId: string, id: string) =>
    invoke<IpcResult<PropertyDto>>(CHANNELS.getProperty, { sessionId, input: id }),
  listProperties: (sessionId: string, input?: ListPropertiesInput) =>
    invoke<IpcResult<PropertyDto[]>>(CHANNELS.listProperties, { sessionId, input: input ?? {} }),
  // Fire-and-forget: процесс завершится раньше, чем придёт ответ invoke.
  quit: () => {
    electron.ipcRenderer.send(CHANNELS.quit);
  },
};

electron.contextBridge.exposeInMainWorld('api', api);
