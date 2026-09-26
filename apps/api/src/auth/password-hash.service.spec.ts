import * as argon2 from 'argon2';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordPolicyError,
} from './password-policy.js';
import {
  ARGON2_PASSWORD_HASH_OPTIONS,
  PasswordHashService,
} from './password-hash.service.js';

describe('PasswordHashService', () => {
  const service = new PasswordHashService();
  const validPassword = 'synthetic-passphrase';

  it('creates a self-contained Argon2id hash rather than storing plaintext', async () => {
    const storedHash = await service.hashPassword(validPassword);

    expect(storedHash).toMatch(/^\$argon2id\$v=19\$/);
    expect(storedHash).not.toBe(validPassword);
    expect(await argon2.verify(storedHash, validPassword)).toBe(true);
  });

  it('verifies the correct password and rejects an incorrect password', async () => {
    const storedHash = await service.hashPassword(validPassword);

    expect(await service.verifyPassword(storedHash, validPassword)).toBe(true);
    expect(
      await service.verifyPassword(storedHash, 'incorrect-passphrase'),
    ).toBe(false);
  });

  it('uses independent salts for identical passwords', async () => {
    const first = await service.hashPassword(validPassword);
    const second = await service.hashPassword(validPassword);

    expect(first).not.toBe(second);
    expect(await service.verifyPassword(first, validPassword)).toBe(true);
    expect(await service.verifyPassword(second, validPassword)).toBe(true);
  });

  it('accepts both password-policy length boundaries', async () => {
    await expect(
      service.hashPassword('a'.repeat(PASSWORD_MIN_LENGTH)),
    ).resolves.toMatch(/^\$argon2id\$/);
    await expect(
      service.hashPassword('a'.repeat(PASSWORD_MAX_LENGTH)),
    ).resolves.toMatch(/^\$argon2id\$/);
  });

  it('rejects passwords below the minimum length', async () => {
    await expect(
      service.hashPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1)),
    ).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it('rejects passwords above the maximum length', async () => {
    await expect(
      service.hashPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1)),
    ).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it('detects hashes made with obsolete parameters', async () => {
    const currentHash = await service.hashPassword(validPassword);
    const obsoleteHash = await argon2.hash(validPassword, {
      ...ARGON2_PASSWORD_HASH_OPTIONS,
      memoryCost: 8_192,
    });

    expect(service.needsRehash(currentHash)).toBe(false);
    expect(service.needsRehash(obsoleteHash)).toBe(true);
  });
});
