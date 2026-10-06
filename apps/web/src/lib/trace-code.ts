export const TRACE_CODE_PATTERN = /^[A-Z0-9_-]{1,128}$/;

export function normalizeTraceCodeInput(value: string): string {
  return value.toUpperCase();
}

export function normalizeTraceCodeSubmission(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidTraceCode(value: string): boolean {
  return TRACE_CODE_PATTERN.test(value);
}
