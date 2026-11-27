export {
  getPolicy,
  changePassword,
  rotatePassword,
  rotationReason,
  canChangePassword,
  PasswordChangeBlockedError,
  ROTATE_WITHIN_DAYS,
  type ChangeOutcome,
} from './password.js';
export { parsePolicy, checkPassword, describePolicy, FALLBACK_POLICY } from './policy.js';
