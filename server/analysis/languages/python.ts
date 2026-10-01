// ============================================================================
//  Python support.
// ============================================================================
import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import type { CallRef, SymbolInfo } from '../../../shared/scan.ts';
import { defineLanguage, type Extracted, type RawImport, type Resolver } from './types.ts';

const line = (n: Node) => n.startPosition.row + 1;
const endLine = (n: Node) => n.endPosition.row + 1;

function collectCalls(body: Node): CallRef[] {
  const seen = new Set<string>();
  const out: CallRef[] = [];
  for (const call of body.descendantsOfType('call')) {
    const fn = call?.childForFieldName('function');
    if (!fn) continue;
    let name = '';
    let receiver: string | undefined;
    if (fn.type === 'identifier') name = fn.text;
    else if (fn.type === 'attribute') {
      name = fn.childForFieldName('attribute')?.text ?? '';
      let obj = fn.childForFieldName('object');
      while (obj && obj.type === 'attribute') obj = obj.childForFieldName('object');
      if (obj?.type === 'identifier') receiver = obj.text;
    }
    const key = `${receiver ?? ''}.${name}`;
    if (!name || seen.has(key) || out.length >= 80) continue;
    seen.add(key);
    out.push(receiver ? { name, receiver } : { name });
  }
  return out;
}

/** "name" or "name as alias" -> { name, alias } */
function nameAndAlias(n: Node): { name: string; alias?: string } {
  if (n.type === 'aliased_import') return { name: n.childForFieldName('name')?.text ?? '', alias: n.childForFieldName('alias')?.text };
  return { name: n.text };
}

function extract(root: Node): Extracted {
  const imports: RawImport[] = [];
  const symbols: SymbolInfo[] = [];

  const addSymbol = (node: Node, parent?: string) => {
    // unwrap  @decorator \n def f(): ...
    const def = node.type === 'decorated_definition' ? node.childForFieldName('definition') : node;
    if (!def) return;
    const name = def.childForFieldName('name')?.text;
    if (!name) return;
    if (def.type === 'function_definition') {
      symbols.push({ name, kind: parent ? 'method' : 'function', startLine: line(node), endLine: endLine(node), exported: !name.startsWith('_'), parent, calls: collectCalls(def) });
    } else if (def.type === 'class_definition') {
      symbols.push({ name, kind: 'class', startLine: line(node), endLine: endLine(node), exported: !name.startsWith('_'), calls: [] });
      for (const m of def.childForFieldName('body')?.namedChildren ?? []) if (m && (m.type === 'function_definition' || m.type === 'decorated_definition')) addSymbol(m, name);
    }
  };

  for (const stmt of root.namedChildren) {
    if (!stmt) continue;
    if (stmt.type === 'import_statement') {
      // import a.b.c  /  import a.b as c, d
      for (const n of stmt.namedChildren) {
        if (!n) continue;
        const { name, alias } = nameAndAlias(n);
        if (name) imports.push({ spec: name, line: line(stmt), bindings: [{ local: alias ?? name, imported: '*' }], kind: 'static' });
      }
    } else if (stmt.type === 'import_from_statement') {
      const mod = stmt.childForFieldName('module_name');
      const spec = mod?.text ?? '';
      const names = stmt.namedChildren.filter((c) => c && c.id !== mod?.id);
      const dotsOnly = /^\.+$/.test(spec);
      if (names.some((n) => n?.type === 'wildcard_import')) {
        imports.push({ spec, line: line(stmt), bindings: [], kind: 'static' });
      } else if (dotsOnly) {
        // from . import foo  ->  foo is most likely a sibling module
        for (const n of names) {
          if (!n) continue;
          const { name, alias } = nameAndAlias(n);
          imports.push({ spec: spec + name, line: line(stmt), bindings: [{ local: alias ?? name, imported: '*' }], kind: 'static' });
        }
      } else {
        const bindings = names.flatMap((n) => {
          if (!n) return [];
          const { name, alias } = nameAndAlias(n);
          return [{ local: alias ?? name, imported: name }];
        });
        imports.push({ spec, line: line(stmt), bindings, kind: 'static' });
      }
    } else if (stmt.type === 'function_definition' || stmt.type === 'class_definition' || stmt.type === 'decorated_definition') {
      addSymbol(stmt);
    }
  }
  return { imports, symbols };
}

function createResolver(_root: string, files: Set<string>): Resolver {
  const probe = (base: string): string | null => {
    base = path.posix.normalize(base);
    if (base.startsWith('../')) return null;
    return [`${base}.py`, `${base}/__init__.py`].find((c) => files.has(c)) ?? null;
  };

  return (spec, fromFile) => {
    const fromDir = path.posix.dirname(fromFile);
    // Relative: ".util" = same folder, "..util" = parent folder...
    const rel = /^(\.+)(.*)$/.exec(spec);
    if (rel) {
      let base = fromDir;
      for (let i = 1; i < rel[1].length; i++) base = path.posix.dirname(base);
      const rest = rel[2].replace(/\./g, '/');
      return rest ? probe(path.posix.join(base, rest)) : files.has(path.posix.join(base, '__init__.py')) ? path.posix.join(base, '__init__.py') : null;
    }
    // Absolute: try from the project root, then from each folder above the importing file
    // (that covers "src/" layouts and sub-projects).
    const asPath = spec.replace(/\./g, '/');
    const roots = new Set<string>(['.']);
    for (let d = fromDir; d && d !== '.'; d = path.posix.dirname(d)) roots.add(d);
    roots.add('src');
    // `import a.b.c` and `from a.b import c` both point at a/b/c.py or a/b.py: try the longest match first.
    const parts = asPath.split('/');
    for (let n = parts.length; n >= 1; n--) {
      for (const r of roots) {
        const hit = probe(path.posix.join(r, parts.slice(0, n).join('/')));
        if (hit) return hit;
      }
    }
    return null;
  };
}

export default defineLanguage({
  id: 'python',
  label: 'Python',
  extensions: ['.py'],
  grammar: () => 'python',
  commentPrefix: '#',
  extract,
  createResolver,
});
