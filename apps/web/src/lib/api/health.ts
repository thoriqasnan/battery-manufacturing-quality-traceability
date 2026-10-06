import { getApiBaseUrl } from "./config";

export type HealthResponse = {
  status: "ok";
  service: "api";
};

function isHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Record<string, unknown>;
  return response.status === "ok" && response.service === "api";
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(new URL("health", getApiBaseUrl()), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("The health endpoint returned an unsuccessful response.");
  }

  const body: unknown = await response.json();

  if (!isHealthResponse(body)) {
    throw new Error("The health endpoint returned an unexpected response.");
  }

  return body;
}
