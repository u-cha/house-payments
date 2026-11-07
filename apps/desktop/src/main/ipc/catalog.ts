import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  CATALOG_ARCHIVE_PROPERTY_CHANNEL,
  CATALOG_ARCHIVE_SUPPLIER_CHANNEL,
  CATALOG_CREATE_PROPERTY_CHANNEL,
  CATALOG_CREATE_PROPERTY_TYPE_CHANNEL,
  CATALOG_CREATE_SUPPLIER_CHANNEL,
  CATALOG_DELETE_PROPERTY_TYPE_CHANNEL,
  CATALOG_FIND_SUPPLIERS_BY_NAME_CHANNEL,
  CATALOG_GET_PROPERTY_CHANNEL,
  CATALOG_GET_SUPPLIER_CHANNEL,
  CATALOG_LIST_PROPERTIES_CHANNEL,
  CATALOG_LIST_PROPERTY_TYPES_CHANNEL,
  CATALOG_LIST_SUPPLIERS_CHANNEL,
  CATALOG_RESTORE_PROPERTY_CHANNEL,
  CATALOG_RESTORE_SUPPLIER_CHANNEL,
  CATALOG_UPDATE_PROPERTY_CHANNEL,
  CATALOG_UPDATE_PROPERTY_TYPE_CHANNEL,
  CATALOG_UPDATE_SUPPLIER_CHANNEL,
  type CreatePropertyInput,
  type CreatePropertyTypeInput,
  type CreateSupplierInput,
  type ListPropertiesInput,
  type ListPropertyTypesInput,
  type ListSuppliersInput,
  type PropertyDto,
  type PropertyTypeDto,
  type SupplierDto,
  type UpdatePropertyInput,
  type UpdatePropertyTypeInput,
  type UpdateSupplierInput,
} from '../../shared/ipc.js';
import type { AppDatabase } from '../infrastructure/db/connection.js';
import {
  createCatalog,
  type Catalog,
  type CatalogActor,
  type CatalogDeps,
} from '../modules/catalog/api.js';
import { requireSession, type InMemorySessionStore } from '../modules/identity/api.js';
import { parseIpcInput, respond } from './result.js';

const sessionIdSchema = z.string().min(1);
const idSchema = z.string().min(1);
const listTypesSchema = z.object({ includeArchived: z.boolean().optional() });
const createTypeSchema = z.object({
  name: z.string(),
  sortOrder: z.number().int().optional(),
});
const updateTypeSchema = z.object({
  id: idSchema,
  name: z.string().optional(),
  isActive: z.boolean().optional(),
});
const createPropertySchema = z.object({
  typeId: idSchema.optional(),
  newTypeName: z.string().optional(),
  label: z.string(),
  address: z.string(),
  areaM2: z.number().finite().nullable().optional(),
  shareBp: z.number().int().optional(),
  note: z.string().nullable().optional(),
});
const updatePropertySchema = z.object({
  id: idSchema,
  typeId: idSchema.optional(),
  newTypeName: z.string().optional(),
  label: z.string().optional(),
  address: z.string().optional(),
  areaM2: z.number().finite().nullable().optional(),
  shareBp: z.number().int().optional(),
  note: z.string().nullable().optional(),
});
const listPropertiesSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  typeId: z.string().optional(),
});
const supplierKindSchema = z.enum(['uk', 'tsj', 'rso', 'other']);
const createSupplierSchema = z.object({
  name: z.string(),
  kind: supplierKindSchema,
  contacts: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
const updateSupplierSchema = z.object({
  id: idSchema,
  name: z.string().optional(),
  kind: supplierKindSchema.optional(),
  contacts: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
const listSuppliersSchema = z.object({
  query: z.string().optional(),
  kind: supplierKindSchema.optional(),
  includeArchived: z.boolean().optional(),
});

/**
 * Все команды каталога адресуют сессию из renderer (core-modules §3):
 * `{ sessionId, input }`. Нет активной сессии — `UNAUTHENTICATED` ещё до use case.
 */
function parseCommand<T extends z.ZodTypeAny>(
  sessions: InMemorySessionStore,
  schema: T,
  value: unknown,
): { sessionId: string; input: z.output<T> } {
  const envelope = parseIpcInput(
    z.object({ sessionId: sessionIdSchema, input: z.unknown() }),
    value,
  );
  // Сначала сессия, потом форма ввода: без входа не раскрываем состояние валидации.
  requireSession(sessions, envelope.sessionId);
  return {
    sessionId: envelope.sessionId,
    input: parseIpcInput(schema, envelope.input) as z.output<T>,
  };
}

/**
 * Use cases моста каталога, вынесенные из `ipcMain`: проверяются тестом без
 * запуска Electron (как `ipc/auth.ts`). DTO совпадают по форме с shared/ipc.ts.
 *
 * Сессию разрешает граница IPC: она владеет стором сессий `identity`, а use case
 * получает только `profileId`-актора для аудита (core-modules §9).
 */
export interface CatalogHandlers {
  listPropertyTypes(sessionId: string, input: ListPropertyTypesInput): PropertyTypeDto[];
  createPropertyType(sessionId: string, input: CreatePropertyTypeInput): PropertyTypeDto;
  updatePropertyType(sessionId: string, input: UpdatePropertyTypeInput): PropertyTypeDto;
  deletePropertyType(sessionId: string, id: string): null;
  createProperty(sessionId: string, input: CreatePropertyInput): PropertyDto;
  updateProperty(sessionId: string, input: UpdatePropertyInput): PropertyDto;
  archiveProperty(sessionId: string, id: string): PropertyDto;
  restoreProperty(sessionId: string, id: string): PropertyDto;
  getProperty(sessionId: string, id: string): PropertyDto;
  listProperties(sessionId: string, input: ListPropertiesInput): PropertyDto[];

  createSupplier(sessionId: string, input: CreateSupplierInput): SupplierDto;
  updateSupplier(sessionId: string, input: UpdateSupplierInput): SupplierDto;
  archiveSupplier(sessionId: string, id: string): SupplierDto;
  restoreSupplier(sessionId: string, id: string): SupplierDto;
  getSupplier(sessionId: string, id: string): SupplierDto;
  listSuppliers(sessionId: string, input: ListSuppliersInput): SupplierDto[];
  findSuppliersByName(sessionId: string, name: string): SupplierDto[];
}

export function createCatalogHandlers(
  catalog: Catalog,
  sessions: InMemorySessionStore,
): CatalogHandlers {
  const actorFor = (sessionId: string): CatalogActor => ({
    profileId: requireSession(sessions, sessionId).profileId,
  });
  const authorize = (sessionId: string): void => {
    requireSession(sessions, sessionId);
  };

  return {
    listPropertyTypes: (sessionId, input) => {
      authorize(sessionId);
      return catalog.listPropertyTypes(input);
    },
    createPropertyType: (sessionId, input) => {
      authorize(sessionId);
      return catalog.createPropertyType(input);
    },
    updatePropertyType: (sessionId, input) => {
      authorize(sessionId);
      return catalog.updatePropertyType(input);
    },
    deletePropertyType: (sessionId, id) => {
      catalog.deletePropertyType(actorFor(sessionId), id);
      return null;
    },
    createProperty: (sessionId, input) => catalog.createProperty(actorFor(sessionId), input),
    updateProperty: (sessionId, input) => catalog.updateProperty(actorFor(sessionId), input),
    archiveProperty: (sessionId, id) => catalog.archiveProperty(actorFor(sessionId), id),
    restoreProperty: (sessionId, id) => catalog.restoreProperty(actorFor(sessionId), id),
    getProperty: (sessionId, id) => {
      authorize(sessionId);
      return catalog.getProperty(id);
    },
    listProperties: (sessionId, input) => {
      authorize(sessionId);
      return catalog.listProperties(input);
    },
    createSupplier: (sessionId, input) => catalog.createSupplier(actorFor(sessionId), input),
    updateSupplier: (sessionId, input) => catalog.updateSupplier(actorFor(sessionId), input),
    archiveSupplier: (sessionId, id) => catalog.archiveSupplier(actorFor(sessionId), id),
    restoreSupplier: (sessionId, id) => catalog.restoreSupplier(actorFor(sessionId), id),
    getSupplier: (sessionId, id) => {
      authorize(sessionId);
      return catalog.getSupplier(id);
    },
    listSuppliers: (sessionId, input) => {
      authorize(sessionId);
      return catalog.listSuppliers(input);
    },
    findSuppliersByName: (sessionId, name) => {
      authorize(sessionId);
      return catalog.findSuppliersByName(name);
    },
  };
}

export function registerCatalog(
  db: AppDatabase,
  deps: CatalogDeps,
  sessions: InMemorySessionStore,
): void {
  const handlers = createCatalogHandlers(createCatalog(db, deps), sessions);
  ipcMain.handle(CATALOG_LIST_PROPERTY_TYPES_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, listTypesSchema, value);
      return handlers.listPropertyTypes(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_CREATE_PROPERTY_TYPE_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, createTypeSchema, value);
      return handlers.createPropertyType(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_UPDATE_PROPERTY_TYPE_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, updateTypeSchema, value);
      return handlers.updatePropertyType(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_DELETE_PROPERTY_TYPE_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, idSchema, value);
      return handlers.deletePropertyType(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_CREATE_PROPERTY_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, createPropertySchema, value);
      return handlers.createProperty(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_UPDATE_PROPERTY_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, updatePropertySchema, value);
      return handlers.updateProperty(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_ARCHIVE_PROPERTY_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, idSchema, value);
      return handlers.archiveProperty(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_RESTORE_PROPERTY_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, idSchema, value);
      return handlers.restoreProperty(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_GET_PROPERTY_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, idSchema, value);
      return handlers.getProperty(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_LIST_PROPERTIES_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, listPropertiesSchema, value);
      return handlers.listProperties(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_CREATE_SUPPLIER_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, createSupplierSchema, value);
      return handlers.createSupplier(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_UPDATE_SUPPLIER_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, updateSupplierSchema, value);
      return handlers.updateSupplier(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_ARCHIVE_SUPPLIER_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, idSchema, value);
      return handlers.archiveSupplier(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_RESTORE_SUPPLIER_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, idSchema, value);
      return handlers.restoreSupplier(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_GET_SUPPLIER_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, idSchema, value);
      return handlers.getSupplier(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_LIST_SUPPLIERS_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, listSuppliersSchema, value);
      return handlers.listSuppliers(sessionId, input);
    }),
  );
  ipcMain.handle(CATALOG_FIND_SUPPLIERS_BY_NAME_CHANNEL, (_event, value: unknown) =>
    respond(() => {
      const { sessionId, input } = parseCommand(sessions, z.string(), value);
      return handlers.findSuppliersByName(sessionId, input);
    }),
  );
}
