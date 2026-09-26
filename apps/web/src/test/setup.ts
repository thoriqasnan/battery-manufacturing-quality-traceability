import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";

function createTestStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: createTestStorage(),
});
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: createTestStorage(),
});

afterEach(() => cleanup());
