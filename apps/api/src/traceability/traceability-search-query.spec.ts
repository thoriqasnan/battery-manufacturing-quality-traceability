import { BadRequestException } from '@nestjs/common';
import { parseTraceabilitySearchQuery } from './traceability-search-query.js';

describe('parseTraceabilitySearchQuery', () => {
  it('normalizes search and filters and applies pagination defaults', () => {
    expect(
      parseTraceabilitySearchQuery({
        query: '  pack-demo  ',
        unitType: ' pack ',
        productModel: ' demo_alpha ',
      }),
    ).toEqual({
      query: 'PACK-DEMO',
      unitType: 'PACK',
      productModel: 'DEMO_ALPHA',
      page: 1,
      pageSize: 25,
    });
  });

  it('treats omitted and whitespace-only search as browse mode', () => {
    expect(parseTraceabilitySearchQuery({}).query).toBeNull();
    expect(parseTraceabilitySearchQuery({ query: '   ' }).query).toBeNull();
  });

  it.each([
    [{ query: 'A'.repeat(129) }, 'query'],
    [{ query: 'PACK DEMO' }, 'query'],
    [{ unitType: 'ASSEMBLY' }, 'unitType'],
    [{ productModel: '' }, 'productModel'],
    [{ productModel: 'DEMO MODEL' }, 'productModel'],
    [{ page: '0' }, 'page'],
    [{ page: '-1' }, 'page'],
    [{ pageSize: '101' }, 'pageSize'],
    [{ pageSize: '1.5' }, 'pageSize'],
    [{ query: ['PACK'] }, 'query'],
  ])('rejects invalid query input %#', (raw, field) => {
    try {
      parseTraceabilitySearchQuery(raw);
      throw new Error('Expected query validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_REQUEST',
        details: [{ field }],
      });
    }
  });
});
