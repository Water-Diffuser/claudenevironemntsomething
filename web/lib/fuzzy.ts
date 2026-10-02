// A tiny fuzzy matcher for the @file menu: type "dpan" and find "web/panels/diff/DiffPanel.tsx".

/**
 * How well `query` matches `path`. Higher is better, -1 means no match.
 *   - the file name starts with the query     (best)
 *   - the file name contains the query
 *   - the whole path contains the query
 *   - the letters appear in order somewhere   (weakest)
 */
export function fuzzyScore(query: string, path: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const p = path.toLowerCase();
  const name = p.slice(p.lastIndexOf('/') + 1);
  if (name.startsWith(q)) return 1000 - name.length;
  if (name.includes(q)) return 800 - name.indexOf(q) - name.length * 0.1;
  if (p.includes(q)) return 600 - p.indexOf(q) * 0.5;
  // letters in order
  let at = 0;
  for (const ch of q) {
    at = p.indexOf(ch, at);
    if (at < 0) return -1;
    at++;
  }
  return 200 - p.length * 0.1;
}

/** The best `limit` paths for a query. Paths in `boost` (e.g. files you have open) float to the top. */
export function rankPaths(query: string, paths: Iterable<string>, boost: Set<string> = new Set(), limit = 8): string[] {
  const scored: Array<[number, string]> = [];
  for (const path of paths) {
    const s = fuzzyScore(query, path);
    if (s >= 0) scored.push([s + (boost.has(path) ? 150 : 0), path]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].length - b[1].length);
  return scored.slice(0, limit).map(([, p]) => p);
}
