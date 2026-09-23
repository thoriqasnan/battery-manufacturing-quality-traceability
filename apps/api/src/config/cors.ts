const developmentFrontendOrigin = 'http://localhost:3000';

export function resolveFrontendOrigin(
  configuredOrigin: string | undefined,
  environment: string | undefined,
): string {
  if (!configuredOrigin) {
    if (environment === 'production') {
      throw new Error('FRONTEND_ORIGIN must be configured in production.');
    }

    return developmentFrontendOrigin;
  }

  let frontendUrl: URL;

  try {
    frontendUrl = new URL(configuredOrigin);
  } catch {
    throw new Error('FRONTEND_ORIGIN must be a valid URL.');
  }

  if (frontendUrl.protocol !== 'http:' && frontendUrl.protocol !== 'https:') {
    throw new Error('FRONTEND_ORIGIN must use HTTP or HTTPS.');
  }

  if (
    frontendUrl.username ||
    frontendUrl.password ||
    frontendUrl.pathname !== '/' ||
    frontendUrl.search ||
    frontendUrl.hash
  ) {
    throw new Error('FRONTEND_ORIGIN must contain only an HTTP(S) origin.');
  }

  return frontendUrl.origin;
}
