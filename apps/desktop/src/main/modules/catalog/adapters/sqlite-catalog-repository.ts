import type { AppDatabase } from '../../../infrastructure/db/connection.js';
import {
  normalizeTypeName,
  type Property,
  type PropertyStatus,
  type PropertyType,
} from '../domain/property.js';
import type {
  CatalogRepository,
  PropertyFilter,
  PropertyRecord,
  PropertyTypeRecord,
} from '../application/catalog-ports.js';

interface PropertyRow {
  id: string;
  type_id: string;
  type_name: string;
  label: string;
  address: string;
  area_m2: number | null;
  share_bp: number;
  note: string | null;
  status: PropertyStatus;
  created_at: string;
}

interface PropertyTypeRow {
  id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

const SELECT_PROPERTY = `
  SELECT p.id, p.type_id, t.name AS type_name, p.label, p.address, p.area_m2,
         p.share_bp, p.note, p.status, p.created_at
  FROM property p
  JOIN property_type t ON t.id = p.type_id`;

const SELECT_TYPE = 'SELECT id, name, sort_order, is_active, created_at FROM property_type';

function toProperty(row: PropertyRow): PropertyRecord {
  return {
    id: row.id,
    typeId: row.type_id,
    typeName: row.type_name,
    label: row.label,
    address: row.address,
    areaM2: row.area_m2,
    shareBp: row.share_bp,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toType(row: PropertyTypeRow): PropertyTypeRecord {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

/** SQLite-адаптер порта каталога: только таблицы property и property_type. */
export class SqliteCatalogRepository implements CatalogRepository {
  constructor(private readonly db: AppDatabase) {}

  insertProperty(property: Property): void {
    this.db
      .prepare(
        `INSERT INTO property
           (id, type_id, label, address, area_m2, share_bp, note, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        property.id,
        property.typeId,
        property.label,
        property.address,
        property.areaM2,
        property.shareBp,
        property.note,
        property.status,
        property.createdAt,
      );
  }

  updateProperty(property: Property): void {
    this.db
      .prepare(
        `UPDATE property
         SET type_id = ?, label = ?, address = ?, area_m2 = ?, share_bp = ?, note = ?, status = ?
         WHERE id = ?`,
      )
      .run(
        property.typeId,
        property.label,
        property.address,
        property.areaM2,
        property.shareBp,
        property.note,
        property.status,
        property.id,
      );
  }

  findProperty(id: string): PropertyRecord | undefined {
    const row = this.db.prepare(`${SELECT_PROPERTY} WHERE p.id = ?`).get(id) as
      PropertyRow | undefined;
    return row === undefined ? undefined : toProperty(row);
  }

  listProperties(filter: PropertyFilter): PropertyRecord[] {
    const conditions = ['p.status = ?'];
    const params: unknown[] = [filter.status];
    if (filter.typeId !== undefined) {
      conditions.push('p.type_id = ?');
      params.push(filter.typeId);
    }
    const rows = this.db
      .prepare(
        `${SELECT_PROPERTY} WHERE ${conditions.join(' AND ')}
         ORDER BY p.label COLLATE NOCASE, p.id`,
      )
      .all(...params) as PropertyRow[];
    return rows.map(toProperty);
  }

  insertPropertyType(type: PropertyType): void {
    this.db
      .prepare(
        `INSERT INTO property_type (id, name, name_key, sort_order, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        type.id,
        type.name,
        normalizeTypeName(type.name),
        type.sortOrder,
        type.isActive ? 1 : 0,
        type.createdAt,
      );
  }

  updatePropertyType(type: PropertyType): void {
    this.db
      .prepare(
        'UPDATE property_type SET name = ?, name_key = ?, sort_order = ?, is_active = ? WHERE id = ?',
      )
      .run(type.name, normalizeTypeName(type.name), type.sortOrder, type.isActive ? 1 : 0, type.id);
  }

  findPropertyType(id: string): PropertyTypeRecord | undefined {
    const row = this.db.prepare(`${SELECT_TYPE} WHERE id = ?`).get(id) as
      PropertyTypeRow | undefined;
    return row === undefined ? undefined : toType(row);
  }

  findPropertyTypeByName(name: string, excludeId?: string): PropertyTypeRecord | undefined {
    const row =
      excludeId === undefined
        ? this.db.prepare(`${SELECT_TYPE} WHERE name_key = ?`).get(normalizeTypeName(name))
        : this.db
            .prepare(`${SELECT_TYPE} WHERE name_key = ? AND id <> ?`)
            .get(normalizeTypeName(name), excludeId);
    return row === undefined ? undefined : toType(row as PropertyTypeRow);
  }

  listPropertyTypes(includeArchived: boolean): PropertyTypeRecord[] {
    const sql = includeArchived
      ? `${SELECT_TYPE} ORDER BY sort_order, name COLLATE NOCASE`
      : `${SELECT_TYPE} WHERE is_active = 1 ORDER BY sort_order, name COLLATE NOCASE`;
    return (this.db.prepare(sql).all() as PropertyTypeRow[]).map(toType);
  }
}
