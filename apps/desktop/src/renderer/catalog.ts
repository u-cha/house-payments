import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePropertyInput,
  CreatePropertyTypeInput,
  PropertyDto,
  PropertyStatus,
  UpdatePropertyInput,
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

/** Экспорт для тестов и экранов: тип записи списка. */
export type PropertyListRecord = PropertyDto;
