const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export function getApiBaseUrl(): URL {
  if (!configuredApiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

  let apiBaseUrl: URL;

  try {
    apiBaseUrl = new URL(configuredApiBaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be a valid URL.");
  }

  if (apiBaseUrl.protocol !== "http:" && apiBaseUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }

  if (
    apiBaseUrl.username ||
    apiBaseUrl.password ||
    apiBaseUrl.search ||
    apiBaseUrl.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must not contain credentials, a query, or a fragment.",
    );
  }

  apiBaseUrl.pathname = `${apiBaseUrl.pathname.replace(/\/$/, "")}/`;
  return apiBaseUrl;
}
