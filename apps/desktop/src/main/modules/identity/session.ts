import { randomBytes } from 'node:crypto';
import type { Clock } from '../../shared/clock.js';
import { AppError } from '../../shared/errors.js';

export interface Session {
  id: string;
  profileId: string;
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Сессия живёт только в памяти процесса (ADR-0006, core-modules §9): на диск не
 * пишется, после перезапуска приложения вход требуется снова. Токен — случайные
 * 32 байта: угадать его по `profile_id` нельзя.
 */
export class InMemorySessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly clock: Clock) {}

  create(profileId: string): Session {
    const now = this.clock.now().toISOString();
    const session: Session = {
      id: randomBytes(32).toString('base64url'),
      profileId,
      createdAt: now,
      lastActivityAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  end(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

/** Сессия по токену или `UNAUTHENTICATED`: общий чекпойнт для команд IPC (core-modules §3). */
export function requireSession(sessions: InMemorySessionStore, sessionId: string): Session {
  const session = sessions.get(sessionId);
  if (session === undefined) {
    throw new AppError({
      code: 'UNAUTHENTICATED',
      message: 'Сессия не найдена или истекла: войдите снова',
      retryable: false,
    });
  }
  return session;
}
