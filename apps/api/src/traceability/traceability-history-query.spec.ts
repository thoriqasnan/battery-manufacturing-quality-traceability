import { BadRequestException } from '@nestjs/common';
import {
  parseNonconformanceHistoryQuery,
  parseProcessHistoryQuery,
  parseQualityHistoryQuery,
} from './traceability-history-query.js';

describe('traceability history query contracts', () => {
  it('applies the approved independent pagination defaults', () => {
    expect(parseProcessHistoryQuery({})).toEqual({ page: 1, pageSize: 25 });
    expect(parseQualityHistoryQuery({})).toEqual({
      page: 1,
      pageSize: 25,
      outcome: null,
    });
    expect(parseNonconformanceHistoryQuery({})).toEqual({
      page: 1,
      pageSize: 10,
      status: null,
    });
  });

  it('accepts minimum values, maximum page sizes, and documented filters', () => {
    expect(parseProcessHistoryQuery({ page: '1', pageSize: '100' })).toEqual({
      page: 1,
      pageSize: 100,
    });
    expect(parseQualityHistoryQuery({ page: '2', pageSize: '100', outcome: ' ng ' })).toEqual({
      page: 2,
      pageSize: 100,
      outcome: 'NG',
    });
    expect(parseNonconformanceHistoryQuery({ page: '3', pageSize: '50', status: ' in_progress ' })).toEqual({
      page: 3,
      pageSize: 50,
      status: 'IN_PROGRESS',
    });
  });

  it.each([
    [() => parseProcessHistoryQuery({ page: '0' }), 'page'],
    [() => parseProcessHistoryQuery({ page: '1.5' }), 'page'],
    [() => parseProcessHistoryQuery({ pageSize: '101' }), 'pageSize'],
    [() => parseQualityHistoryQuery({ pageSize: '-1' }), 'pageSize'],
    [() => parseQualityHistoryQuery({ outcome: 'UNKNOWN' }), 'outcome'],
    [() => parseQualityHistoryQuery({ outcome: ['PASS'] }), 'outcome'],
    [() => parseNonconformanceHistoryQuery({ pageSize: '51' }), 'pageSize'],
    [() => parseNonconformanceHistoryQuery({ status: 'ARCHIVED' }), 'status'],
  ])('rejects malformed or unbounded requests %#', (parse, field) => {
    try {
      parse();
      throw new Error('Expected history query validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_REQUEST',
        details: [{ field }],
      });
    }
  });
});
