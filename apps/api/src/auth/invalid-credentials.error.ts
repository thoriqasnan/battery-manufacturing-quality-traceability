export class InvalidCredentialsError extends Error {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Invalid username or password.');
    this.name = 'InvalidCredentialsError';
  }
}
