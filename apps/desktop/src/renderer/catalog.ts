import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePropertyInput,
  CreatePropertyTypeInput,
  CreateSupplierInput,
  ListSuppliersInput,
  PropertyDto,
  PropertyStatus,
  SupplierDto,
  UpdatePropertyInput,
  UpdateSupplierInput,
} from '../shared/ipc';
import { api } from './api';

/** Ключи кэша S-04: список по статусу+типу и справочник типов. */
export const propertyKeys = {
  all: ['properties'] as const,
  list: (status: PropertyStatus, typeId: string | undefined) =>
    ['properties', { status, typeId: typeId ?? null }] as const,
  types: ['property-types'] as const,
};

function requireSession(sessionId: string | null): string {
  if (sessionId === null) throw new Error('Нет активной сессии: войдите снова');
  return sessionId;
}

export function usePropertyTypes(sessionId: string | null) {
  return useQuery({
    queryKey: propertyKeys.types,
    enabled: sessionId !== null,
    queryFn: () => api.listPropertyTypes(requireSession(sessionId)),
  });
}

export function useProperties(
  sessionId: string | null,
  status: PropertyStatus,
  typeId: string | undefined,
) {
  return useQuery({
    queryKey: propertyKeys.list(status, typeId),
    enabled: sessionId !== null,
    queryFn: () => api.listProperties(requireSession(sessionId), { status, typeId }),
  });
}

/**
 * После записи инвалидируем списки и справочник: сохранение объекта может
 * создать тип из черновика формы, поэтому ключа списков недостаточно.
 */
function useInvalidateCatalog() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: propertyKeys.all }),
      client.invalidateQueries({ queryKey: propertyKeys.types }),
    ]);
}

export function useCreateProperty(sessionId: string | null) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: CreatePropertyInput) =>
      api.createProperty(requireSession(sessionId), input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProperty(sessionId: string | null) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: UpdatePropertyInput) =>
      api.updateProperty(requireSession(sessionId), input),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveProperty(sessionId: string | null) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (id: string) => api.archiveProperty(requireSession(sessionId), id),
    onSuccess: () => invalidate(),
  });
}

export function useRestoreProperty(sessionId: string | null) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (id: string) => api.restoreProperty(requireSession(sessionId), id),
    onSuccess: () => invalidate(),
  });
}

export function useDeletePropertyType(sessionId: string | null) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (id: string) => api.deletePropertyType(requireSession(sessionId), id),
    onSuccess: () => invalidate(),
  });
}

export function useCreatePropertyType(sessionId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePropertyTypeInput) =>
      api.createPropertyType(requireSession(sessionId), input),
    onSuccess: () => client.invalidateQueries({ queryKey: propertyKeys.types }),
  });
}

/* ------------------------------------------------------------------ */
/* S-06 «Поставщики»: список по признаку архива + поиск дублей названия */
/* ------------------------------------------------------------------ */

/** Ключи кэша S-06: список по признаку архива и подсказка о дубле. */
export const supplierKeys = {
  all: ['suppliers'] as const,
  list: (filter: ListSuppliersInput) =>
    [
      'suppliers',
      {
        includeArchived: filter.includeArchived === true,
        kind: filter.kind ?? null,
        query: filter.query ?? '',
      },
    ] as const,
  duplicates: (name: string) => ['suppliers', 'duplicates', name] as const,
};

/** Поиск и фильтры выполняет main; прежний список держим на экране до ответа. */
export function useSuppliers(sessionId: string | null, filter: ListSuppliersInput) {
  return useQuery({
    queryKey: supplierKeys.list(filter),
    enabled: sessionId !== null,
    queryFn: () => api.listSuppliers(requireSession(sessionId), filter),
    placeholderData: (previous) => previous,
  });
}

/**
 * Совпадения по названию для предупреждения о дубле. Запрос живёт только пока
 * введено непустое название: пустая строка ничего не ищет.
 */
export function useSupplierDuplicates(sessionId: string | null, name: string) {
  const key = name.trim();
  return useQuery({
    queryKey: supplierKeys.duplicates(key.toLowerCase()),
    enabled: sessionId !== null && key !== '',
    queryFn: () => api.findSuppliersByName(requireSession(sessionId), key),
  });
}

function useInvalidateSuppliers() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: supplierKeys.all });
}

export function useCreateSupplier(sessionId: string | null) {
  const invalidate = useInvalidateSuppliers();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) =>
      api.createSupplier(requireSession(sessionId), input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateSupplier(sessionId: string | null) {
  const invalidate = useInvalidateSuppliers();
  return useMutation({
    mutationFn: (input: UpdateSupplierInput) =>
      api.updateSupplier(requireSession(sessionId), input),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveSupplier(sessionId: string | null) {
  const invalidate = useInvalidateSuppliers();
  return useMutation({
    mutationFn: (id: string) => api.archiveSupplier(requireSession(sessionId), id),
    onSuccess: () => invalidate(),
  });
}

export function useRestoreSupplier(sessionId: string | null) {
  const invalidate = useInvalidateSuppliers();
  return useMutation({
    mutationFn: (id: string) => api.restoreSupplier(requireSession(sessionId), id),
    onSuccess: () => invalidate(),
  });
}

/** Экспорт для тестов и экранов: тип записи списка. */
export type PropertyListRecord = PropertyDto;
export type SupplierListRecord = SupplierDto;
