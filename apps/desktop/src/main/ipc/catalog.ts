import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  CATALOG_ARCHIVE_PROPERTY_CHANNEL,
  CATALOG_CREATE_PROPERTY_CHANNEL,
  CATALOG_CREATE_PROPERTY_TYPE_CHANNEL,
  CATALOG_GET_PROPERTY_CHANNEL,
  CATALOG_LIST_PROPERTIES_CHANNEL,
  CATALOG_LIST_PROPERTY_TYPES_CHANNEL,
  CATALOG_RESTORE_PROPERTY_CHANNEL,
  CATALOG_UPDATE_PROPERTY_CHANNEL,
  CATALOG_UPDATE_PROPERTY_TYPE_CHANNEL,
  type CreatePropertyInput,
  type CreatePropertyTypeInput,
  type ListPropertiesInput,
  type ListPropertyTypesInput,
  type PropertyDto,
  type PropertyTypeDto,
  type UpdatePropertyInput,
  type UpdatePropertyTypeInput,
} from '../../shared/ipc.js';
import type { AppDatabase } from '../infrastructure/db/connection.js';
import { createCatalog, type Catalog, type CatalogDeps } from '../modules/catalog/api.js';
import { parseIpcInput, respond } from './result.js';

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
  typeId: idSchema,
  label: z.string(),
  address: z.string(),
  areaM2: z.number().finite().nullable().optional(),
  shareBp: z.number().int().optional(),
  note: z.string().nullable().optional(),
});
const updatePropertySchema = z.object({
  id: idSchema,
  typeId: idSchema.optional(),
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

/**
 * Use cases моста каталога, вынесенные из `ipcMain`: проверяются тестом без
 * запуска Electron (как `ipc/auth.ts`). DTO совпадают по форме с shared/ipc.ts.
 */
export interface CatalogHandlers {
  listPropertyTypes(input: ListPropertyTypesInput): PropertyTypeDto[];
  createPropertyType(input: CreatePropertyTypeInput): PropertyTypeDto;
  updatePropertyType(input: UpdatePropertyTypeInput): PropertyTypeDto;
  createProperty(input: CreatePropertyInput): PropertyDto;
  updateProperty(input: UpdatePropertyInput): PropertyDto;
  archiveProperty(id: string): PropertyDto;
  restoreProperty(id: string): PropertyDto;
  getProperty(id: string): PropertyDto;
  listProperties(input: ListPropertiesInput): PropertyDto[];
}

export function createCatalogHandlers(catalog: Catalog): CatalogHandlers {
  return {
    listPropertyTypes: (input) => catalog.listPropertyTypes(input),
    createPropertyType: (input) => catalog.createPropertyType(input),
    updatePropertyType: (input) => catalog.updatePropertyType(input),
    createProperty: (input) => catalog.createProperty(input),
    updateProperty: (input) => catalog.updateProperty(input),
    archiveProperty: (id) => catalog.archiveProperty(id),
    restoreProperty: (id) => catalog.restoreProperty(id),
    getProperty: (id) => catalog.getProperty(id),
    listProperties: (input) => catalog.listProperties(input),
  };
}

export function registerCatalog(db: AppDatabase, deps: CatalogDeps): void {
  const handlers = createCatalogHandlers(createCatalog(db, deps));
  ipcMain.handle(CATALOG_LIST_PROPERTY_TYPES_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.listPropertyTypes(parseIpcInput(listTypesSchema, input ?? {}))),
  );
  ipcMain.handle(CATALOG_CREATE_PROPERTY_TYPE_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.createPropertyType(parseIpcInput(createTypeSchema, input))),
  );
  ipcMain.handle(CATALOG_UPDATE_PROPERTY_TYPE_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.updatePropertyType(parseIpcInput(updateTypeSchema, input))),
  );
  ipcMain.handle(CATALOG_CREATE_PROPERTY_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.createProperty(parseIpcInput(createPropertySchema, input))),
  );
  ipcMain.handle(CATALOG_UPDATE_PROPERTY_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.updateProperty(parseIpcInput(updatePropertySchema, input))),
  );
  ipcMain.handle(CATALOG_ARCHIVE_PROPERTY_CHANNEL, (_event, id: unknown) =>
    respond(() => handlers.archiveProperty(parseIpcInput(idSchema, id))),
  );
  ipcMain.handle(CATALOG_RESTORE_PROPERTY_CHANNEL, (_event, id: unknown) =>
    respond(() => handlers.restoreProperty(parseIpcInput(idSchema, id))),
  );
  ipcMain.handle(CATALOG_GET_PROPERTY_CHANNEL, (_event, id: unknown) =>
    respond(() => handlers.getProperty(parseIpcInput(idSchema, id))),
  );
  ipcMain.handle(CATALOG_LIST_PROPERTIES_CHANNEL, (_event, input: unknown) =>
    respond(() => handlers.listProperties(parseIpcInput(listPropertiesSchema, input ?? {}))),
  );
}
