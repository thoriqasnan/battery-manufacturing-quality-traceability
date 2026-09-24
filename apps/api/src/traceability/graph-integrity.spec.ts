import { findGenealogyCycles } from './graph-integrity.js';

describe('findGenealogyCycles', () => {
  it('accepts an acyclic genealogy', () => {
    expect(
      findGenealogyCycles([
        { parentUnitId: 'pack', childUnitId: 'module' },
        { parentUnitId: 'module', childUnitId: 'cell' },
      ]),
    ).toEqual([]);
  });

  it('terminates and reports a malformed cycle', () => {
    const cycles = findGenealogyCycles([
      { parentUnitId: 'pack', childUnitId: 'module' },
      { parentUnitId: 'module', childUnitId: 'cell' },
      { parentUnitId: 'cell', childUnitId: 'pack' },
    ]);
    expect(cycles).toEqual([['pack', 'module', 'cell', 'pack']]);
  });
});
