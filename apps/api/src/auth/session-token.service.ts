import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_TOKEN_BYTES = 32;

@Injectable()
export class SessionTokenService {
  generateToken(): string {
    return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  }

  digestToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
