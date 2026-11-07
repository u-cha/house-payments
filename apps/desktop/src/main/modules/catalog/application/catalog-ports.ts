import type { Property, PropertyStatus, PropertyType } from '../domain/property.js';
import type { Supplier, SupplierKind } from '../domain/supplier.js';

/** Объект вместе с названием типа — read-model для карточки и списка. */
export interface PropertyRecord extends Property {
  typeName: string;
}

/**
 * Тип вместе со счётчиком использования — read-model справочника: удалять можно
 * только тип, на который не ссылается ни один объект (архивные тоже считаются).
 */
export interface PropertyTypeRecord extends PropertyType {
  usageCount: number;
  /** Сколько из них активных. */
  activeCount: number;
  /** Сколько из них архивных (архивные тоже считают тип занятым). */
  archivedCount: number;
  /** Названия всех использующих объектов — заполняется в списке справочника. */
  usedBy?: string[];
}

export interface SupplierFilter {
  /** Подстрока названия без учёта регистра; trim, пустая — без поиска. */
  query?: string;
  kind?: SupplierKind;
  /** По умолчанию рабочий список — без архива. */
  includeArchived?: boolean;
}

export interface PropertyFilter {
  /** По умолчанию рабочий список — без архива. */
  status: PropertyStatus;
  typeId?: string;
}

/** Порт хранилища каталога: use case не знает про SQLite (core-modules §3). */
export interface CatalogRepository {
  insertProperty(property: Property): void;
  updateProperty(property: Property): void;
  findProperty(id: string): PropertyRecord | undefined;
  listProperties(filter: PropertyFilter): PropertyRecord[];
  /** Все объекты типа, включая архивные: ими объясняется запрет удаления. */
  listPropertiesByType(typeId: string): PropertyRecord[];

  insertPropertyType(type: PropertyType): void;
  updatePropertyType(type: PropertyType): void;
  findPropertyType(id: string): PropertyTypeRecord | undefined;
  findPropertyTypeByName(name: string, excludeId?: string): PropertyTypeRecord | undefined;
  listPropertyTypes(includeArchived: boolean): PropertyTypeRecord[];
  deletePropertyType(id: string): void;

  insertSupplier(supplier: Supplier): void;
  updateSupplier(supplier: Supplier): void;
  findSupplier(id: string): Supplier | undefined;
  /** Все совпадения по name_key, включая архивные: дубли разрешены (R-13). */
  findSuppliersByName(nameKey: string): Supplier[];
  listSuppliers(filter: SupplierFilter): Supplier[];
}
