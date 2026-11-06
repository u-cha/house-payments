// Публичная точка модуля identity (core-modules §9, §10): профили, пароль и сессия.
export {
  authenticate,
  changeRole,
  createProfile,
  deactivateProfile,
  deleteProfile,
  getOwnerProfile,
  type CreateProfileInput,
  type IdentityDeps,
  type Profile,
  type ProfileRole,
} from './profile-service.js';
export { ARGON2ID_PARAMS, hashPassword, verifyPassword } from './password.js';
export { InMemorySessionStore, requireSession, type Session } from './session.js';
