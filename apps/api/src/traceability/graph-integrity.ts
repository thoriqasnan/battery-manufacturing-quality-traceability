export interface DirectedEdge {
  parentUnitId: string;
  childUnitId: string;
}

export function findGenealogyCycles(edges: DirectedEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const edge of edges) {
    nodes.add(edge.parentUnitId);
    nodes.add(edge.childUnitId);
    const children = adjacency.get(edge.parentUnitId) ?? [];
    children.push(edge.childUnitId);
    adjacency.set(edge.parentUnitId, children);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];

  const visit = (node: string): void => {
    if (active.has(node)) {
      const start = path.indexOf(node);
      cycles.push([...path.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    active.add(node);
    path.push(node);
    for (const child of adjacency.get(node) ?? []) visit(child);
    path.pop();
    active.delete(node);
  };

  for (const node of nodes) visit(node);
  return cycles;
}
