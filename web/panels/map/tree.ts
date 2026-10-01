// ============================================================================
//  tree.ts: files  ->  nested folders  ->  treemap rectangles (via d3-hierarchy).
//  A treemap gives every file a rectangle whose AREA is proportional to its lines
//  of code, packed inside the rectangle of its folder.
// ============================================================================
import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3-hierarchy';
import { config } from '@config';
import type { Kind } from '@shared/events';
import type { FileInfo } from '@shared/scan';

export interface TNode {
  /** Label to show (may be "src/app" when single-child folders are merged). */
  name: string;
  /** Full project-relative path ("" for the root). */
  path: string;
  isDir: boolean;
  file?: FileInfo;
  /** Set for files that are not in the scan: just created (or just deleted) by Claude. */
  ghost?: Kind;
  /** For the "…12 small files" pseudo-cell: how many files were merged into it. */
  dust?: number;
  children?: TNode[];
  /** Size of a leaf (lines of code). */
  value: number;
}

export interface Ghost {
  kind: Kind;
  lines: number;
}

/** Height of the title bar drawn at the top of each folder region. */
export const LABEL_H = 15;
/** Cells smaller than this many square pixels are merged into a "small files" cell. */
const MIN_CELL_AREA = 7;

/** Does this file name match one of config.scan.generatedPatterns (lockfiles, minified bundles...)? */
const GENERATED = config.scan.generatedPatterns.map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
const isGenerated = (name: string) => GENERATED.some((re) => re.test(name));

// ---- 1. build the folder tree -------------------------------------------------------
export function buildTree(files: Iterable<FileInfo>, ghosts: Map<string, Ghost>, rootName = ''): TNode {
  const root: TNode = { name: rootName, path: '', isDir: true, children: [], value: 0 };
  const dirs = new Map<string, TNode>([['', root]]);

  const dirFor = (dirPath: string): TNode => {
    const hit = dirs.get(dirPath);
    if (hit) return hit;
    const slash = dirPath.lastIndexOf('/');
    const parent = dirFor(slash < 0 ? '' : dirPath.slice(0, slash));
    const node: TNode = { name: dirPath.slice(slash + 1), path: dirPath, isDir: true, children: [], value: 0 };
    parent.children!.push(node);
    dirs.set(dirPath, node);
    return node;
  };

  const addLeaf = (path: string, leaf: Omit<TNode, 'name' | 'path' | 'isDir'>) => {
    const slash = path.lastIndexOf('/');
    dirFor(slash < 0 ? '' : path.slice(0, slash)).children!.push({ name: path.slice(slash + 1), path, isDir: false, ...leaf });
  };

  for (const f of files) {
    const size = isGenerated(f.path.slice(f.path.lastIndexOf('/') + 1)) ? Math.min(f.lines, config.scan.generatedMaxLines) : f.lines;
    addLeaf(f.path, { file: f, value: Math.max(1, size) });
  }
  for (const [path, g] of ghosts) addLeaf(path, { ghost: g.kind, value: Math.max(45, g.lines) }); // ghosts get a minimum size so you can see them

  const collapse = (n: TNode) => {
    for (const c of n.children ?? []) if (c.isDir) collapse(c);
    // a folder whose only child is another folder: show them as one ("src/app")
    while (n.path !== '' && n.children?.length === 1 && n.children[0].isDir) {
      const only = n.children[0];
      n.name = `${n.name}/${only.name}`;
      n.path = only.path;
      n.children = only.children;
    }
  };
  collapse(root);
  return root;
}

/** Find a folder node. A folder that was merged into its only child ("src" into "src/app") resolves to the merged node. */
export function findNode(root: TNode, path: string): TNode | null {
  if (path === '' || root.path === path) return root;
  for (const c of root.children ?? []) {
    if (!c.isDir) continue;
    if (c.path === path || c.path.startsWith(path + '/')) return c;
    if (path.startsWith(c.path + '/')) {
      const hit = findNode(c, path);
      if (hit) return hit;
    }
  }
  return null;
}

// ---- 2. lay it out ------------------------------------------------------------------
export interface Cell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  depth: number;
  node: TNode;
}

export interface MapLayout {
  cells: Cell[];
  byPath: Map<string, Cell>;
  total: number;
}

function sumValue(n: TNode): number {
  return n.children ? n.children.reduce((a, c) => a + sumValue(c), 0) : n.value;
}

/** Merge leaves too small to see into one "…N small files" cell per folder (caps the cell count). */
function mergeDust(n: TNode, minValue: number): TNode {
  if (!n.children) return n;
  const kept: TNode[] = [];
  let dustValue = 0;
  let dustCount = 0;
  for (const c of n.children) {
    if (c.isDir) kept.push(mergeDust(c, minValue));
    else if (c.value < minValue) (dustValue += c.value), dustCount++;
    else kept.push(c);
  }
  if (dustCount > 1) kept.push({ name: `…${dustCount} small files`, path: `${n.path}/…`, isDir: false, dust: dustCount, value: dustValue });
  else if (dustCount === 1) kept.push(...n.children.filter((c) => !c.isDir && c.value < minValue));
  return { ...n, children: kept };
}

export function computeLayout(root: TNode, width: number, height: number): MapLayout {
  const total = Math.max(1, sumValue(root));
  const minValue = (MIN_CELL_AREA * total) / Math.max(1, width * height);
  const pruned = mergeDust(root, minValue);

  const h = hierarchy<TNode>(pruned, (d) => d.children)
    .sum((d) => (d.children ? 0 : d.value))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const unit = (width * height) / total;
  const laid = treemap<TNode>()
    .tile(treemapSquarify.ratio(1.15))
    .size([width, height])
    .paddingOuter(2)
    .paddingInner(1)
    // Only folders big enough to read get a title bar.
    .paddingTop((n) => (n.depth > 0 && n.children && (n.value ?? 0) * unit > 2600 ? LABEL_H : 2))
    .round(true)(h) as HierarchyRectangularNode<TNode>;

  const cells: Cell[] = [];
  const byPath = new Map<string, Cell>();
  laid.each((n) => {
    const cell: Cell = { x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1, depth: n.depth, node: n.data };
    cells.push(cell);
    byPath.set(n.data.path, cell);
  });
  return { cells, byPath, total };
}
