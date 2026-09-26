import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { assertPasswordPolicy } from './password-policy.js';

export const ARGON2_PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

const ARGON2_REHASH_OPTIONS = Object.freeze({
  memoryCost: ARGON2_PASSWORD_HASH_OPTIONS.memoryCost,
  timeCost: ARGON2_PASSWORD_HASH_OPTIONS.timeCost,
  parallelism: ARGON2_PASSWORD_HASH_OPTIONS.parallelism,
});

@Injectable()
export class PasswordHashService {
  private readonly dummyHash = argon2.hash(
    randomBytes(32),
    ARGON2_PASSWORD_HASH_OPTIONS,
  );

  async hashPassword(plaintext: string): Promise<string> {
    assertPasswordPolicy(plaintext);
    return argon2.hash(plaintext, ARGON2_PASSWORD_HASH_OPTIONS);
  }

  async verifyPassword(
    storedHash: string,
    candidatePlaintext: string,
  ): Promise<boolean> {
    try {
      return await argon2.verify(storedHash, candidatePlaintext);
    } catch {
      return false;
    }
  }

  async verifyAgainstDummyHash(candidatePlaintext: string): Promise<void> {
    await this.verifyPassword(await this.dummyHash, candidatePlaintext);
  }

  needsRehash(storedHash: string): boolean {
    try {
      return (
        !storedHash.startsWith('$argon2id$') ||
        argon2.needsRehash(storedHash, ARGON2_REHASH_OPTIONS)
      );
    } catch {
      return true;
    }
  }
}
