import { Injectable } from '@nestjs/common';
import { TraceabilitySearchRepository } from './traceability-search.repository.js';
import type {
  TraceabilitySearchQuery,
  TraceabilitySearchResponse,
} from './traceability-search.types.js';

@Injectable()
export class TraceabilitySearchService {
  constructor(private readonly repository: TraceabilitySearchRepository) {}

  async search(
    query: TraceabilitySearchQuery,
  ): Promise<TraceabilitySearchResponse> {
    const result = await this.repository.search(query);
    return {
      items: result.items.map(({ id: _id, ...item }) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        lastActivityAt: item.lastActivityAt?.toISOString() ?? null,
      })),
      page: {
        number: query.page,
        size: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    };
  }
}
