/**
 * Порт событий и аудита (ADR-0005, core-modules §5): модули пользуются им, а
 * таблицами `change_log`/`audit_event` владеет только транзакционный слой.
 * Запись обязана идти в транзакции вызывающего use case (core-modules §7).
 */
export interface DomainEventInput {
  entityType: string;
  entityId: string;
  operation: string;
  payload: Record<string, unknown>;
}

export interface AuditEventInput {
  profileId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface EventRecorder {
  recordChange(event: DomainEventInput): void;
  recordAudit(event: AuditEventInput): void;
}
