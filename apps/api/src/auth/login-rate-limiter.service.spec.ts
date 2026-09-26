import {
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_WINDOW_MS,
  LoginRateLimiterService,
} from './login-rate-limiter.service.js';

describe('LoginRateLimiterService', () => {
  it('is enabled only for production runtime', () => {
    const limiter = new LoginRateLimiterService();

    expect(limiter.isEnabled('production')).toBe(true);
    expect(limiter.isEnabled('development')).toBe(false);
    expect(limiter.isEnabled('test')).toBe(false);
    expect(limiter.isEnabled(undefined)).toBe(false);
  });

  it('applies one bounded generic limit per client and resets by time window', () => {
    const limiter = new LoginRateLimiterService();
    const startedAt = 1_000;

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT; attempt += 1) {
      expect(limiter.consume('client-a', startedAt)).toBe(true);
    }

    expect(limiter.consume('client-a', startedAt)).toBe(false);
    expect(limiter.consume('client-b', startedAt)).toBe(true);
    expect(
      limiter.consume('client-a', startedAt + LOGIN_RATE_WINDOW_MS),
    ).toBe(true);
  });
});
