import type { Property, PropertyStatus, PropertyType } from '../domain/property.js';

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
  /** Названия использующих объектов — заполняется в списке справочника. */
  usedBy?: string[];
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
}
