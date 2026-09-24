export class TraceableUnitNotFoundError extends Error {
  constructor(traceCode: string) {
    super(`Traceable unit not found: ${traceCode}`);
    this.name = 'TraceableUnitNotFoundError';
  }
}
