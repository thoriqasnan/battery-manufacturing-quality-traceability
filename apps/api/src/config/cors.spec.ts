import { resolveFrontendOrigin } from './cors.js';

describe('resolveFrontendOrigin', () => {
  it('uses the configured HTTP origin', () => {
    expect(
      resolveFrontendOrigin('https://web.example.test', 'production'),
    ).toBe('https://web.example.test');
  });

  it('uses the local frontend origin outside production', () => {
    expect(resolveFrontendOrigin(undefined, 'development')).toBe(
      'http://localhost:3000',
    );
  });

  it('requires explicit production configuration', () => {
    expect(() => resolveFrontendOrigin(undefined, 'production')).toThrow(
      'FRONTEND_ORIGIN must be configured in production.',
    );
  });

  it('rejects a value that is not an origin', () => {
    expect(() =>
      resolveFrontendOrigin('http://localhost:3000/path', 'development'),
    ).toThrow('FRONTEND_ORIGIN must contain only an HTTP(S) origin.');
  });
});
