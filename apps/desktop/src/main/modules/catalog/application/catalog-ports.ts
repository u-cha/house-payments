import type { Property, PropertyStatus, PropertyType } from '../domain/property.js';

/** Объект вместе с названием типа — read-model для карточки и списка. */
export interface PropertyRecord extends Property {
  typeName: string;
}

export type PropertyTypeRecord = PropertyType;

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

  insertPropertyType(type: PropertyType): void;
  updatePropertyType(type: PropertyType): void;
  findPropertyType(id: string): PropertyTypeRecord | undefined;
  findPropertyTypeByName(name: string, excludeId?: string): PropertyTypeRecord | undefined;
  listPropertyTypes(includeArchived: boolean): PropertyTypeRecord[];
}
