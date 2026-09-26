export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export class PasswordPolicyError extends Error {
  readonly code = 'PASSWORD_POLICY_VIOLATION';

  constructor() {
    super('Password does not meet the configured length policy.');
    this.name = 'PasswordPolicyError';
  }
}

export function assertPasswordPolicy(password: string): void {
  const length = Array.from(password).length;

  if (
    length < PASSWORD_MIN_LENGTH ||
    length > PASSWORD_MAX_LENGTH ||
    password.trim().length === 0
  ) {
    throw new PasswordPolicyError();
  }
}
