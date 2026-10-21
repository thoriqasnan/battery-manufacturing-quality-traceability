import { createHash } from 'node:crypto';
import type { ManagementSpecificationDetail } from './inspection-specification.types.js';

type EtagSource = Omit<
  ManagementSpecificationDetail,
  'createdAt' | 'updatedAt'
>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function specificationEtag(source: EtagSource): string {
  const normalized =
    'options' in source.configuration
      ? {
          ...source,
          configuration: {
            ...source.configuration,
            options: [...source.configuration.options].sort((left, right) =>
              left.code.localeCompare(right.code),
            ),
          },
        }
      : source;
  const canonical = JSON.stringify(canonicalize(normalized));
  const digest = createHash('sha256').update(canonical).digest('base64url');
  return `"spec-v1-${digest}"`;
}
