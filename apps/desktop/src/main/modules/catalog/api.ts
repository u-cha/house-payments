// Публичная точка модуля catalog (core-modules §3–§4): объекты, типы объектов и поставщики.
// Внутренние слои (domain/application/adapters) снаружи не импортируются.
import type { AppDatabase } from '../../infrastructure/db/connection.js';
import { SqliteCatalogRepository } from './adapters/sqlite-catalog-repository.js';
import {
  createCatalogService,
  type Catalog,
  type CatalogDeps,
} from './application/catalog-service.js';

export function createCatalog(db: AppDatabase, deps: CatalogDeps): Catalog {
  return createCatalogService(db, new SqliteCatalogRepository(db), deps);
}

export type {
  Catalog,
  CatalogActor,
  CatalogDeps,
  CreatePropertyInput,
  CreatePropertyTypeInput,
  CreateSupplierInput,
  UpdatePropertyInput,
  UpdatePropertyTypeInput,
  UpdateSupplierInput,
} from './application/catalog-service.js';
export type {
  PropertyFilter,
  PropertyRecord,
  PropertyTypeRecord,
} from './application/catalog-ports.js';
export type { Property, PropertyStatus, PropertyType } from './domain/property.js';
export type { Supplier, SupplierKind } from './domain/supplier.js';
