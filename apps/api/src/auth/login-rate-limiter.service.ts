import { Injectable } from '@nestjs/common';

export const LOGIN_RATE_LIMIT = 10;
export const LOGIN_RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 10_000;

type AttemptWindow = {
  count: number;
  resetAt: number;
};

@Injectable()
export class LoginRateLimiterService {
  private readonly attempts = new Map<string, AttemptWindow>();

  isEnabled(environment: string | undefined): boolean {
    return environment === 'production';
  }

  consume(clientKey: string, now = Date.now()): boolean {
    const current = this.attempts.get(clientKey);

    if (!current || current.resetAt <= now) {
      this.ensureCapacity(now);
      this.attempts.set(clientKey, {
        count: 1,
        resetAt: now + LOGIN_RATE_WINDOW_MS,
      });
      return true;
    }

    if (current.count >= LOGIN_RATE_LIMIT) {
      return false;
    }

    current.count += 1;
    return true;
  }

  private ensureCapacity(now: number): void {
    if (this.attempts.size < MAX_TRACKED_CLIENTS) return;

    for (const [key, value] of this.attempts) {
      if (value.resetAt <= now) this.attempts.delete(key);
    }

    if (this.attempts.size >= MAX_TRACKED_CLIENTS) {
      const oldestKey = this.attempts.keys().next().value as string | undefined;
      if (oldestKey) this.attempts.delete(oldestKey);
    }
  }
}
