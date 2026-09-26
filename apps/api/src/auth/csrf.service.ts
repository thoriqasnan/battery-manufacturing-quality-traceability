import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const CSRF_HEADER_NAME = 'x-csrf-token';

function csrfSecret(): string {
  const secret = process.env.AUTH_CSRF_SECRET;

  if (
    !secret ||
    secret.length < 32 ||
    secret === 'CHANGE_ME_TO_A_RANDOM_LOCAL_SECRET'
  ) {
    throw new Error('AUTH_CSRF_SECRET must contain at least 32 characters.');
  }

  return secret;
}

@Injectable()
export class CsrfService {
  issueToken(sessionId: string): string {
    return createHmac('sha256', csrfSecret())
      .update(`session:${sessionId}`, 'utf8')
      .digest('base64url');
  }

  isValid(sessionId: string, candidate: string | undefined): boolean {
    if (!candidate) {
      return false;
    }

    const expected = Buffer.from(this.issueToken(sessionId), 'utf8');
    const supplied = Buffer.from(candidate, 'utf8');

    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  }
}
