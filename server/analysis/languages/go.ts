// ============================================================================
//  Go support. This file is the whole job of "teaching INDULGENT a language",
//  so it doubles as the worked example in the README. A language plugin does 3 things:
//    1. says which files and which tree-sitter grammar it handles,
//    2. extract():        reads a syntax tree and lists the imports and the functions/classes,
//    3. createResolver(): turns the text of an import into a file in your project.
// ============================================================================
import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import type { CallRef, SymbolInfo } from '../../../shared/scan.ts';
import { defineLanguage, type Extracted, type RawImport, type Resolver } from './types.ts';

const line = (n: Node) => n.startPosition.row + 1;
const endLine = (n: Node) => n.endPosition.row + 1;
/** In Go, a name that starts with a capital letter is public. */
const isPublic = (name: string) => /^[A-Z]/.test(name);

/** The functions a body calls: `Foo()` or `pkg.Foo()`. */
function collectCalls(body: Node): CallRef[] {
  const seen = new Set<string>();
  const out: CallRef[] = [];
  for (const call of body.descendantsOfType('call_expression')) {
    const fn = call?.childForFieldName('function');
    if (!fn) continue;
    let name = '';
    let receiver: string | undefined;
    if (fn.type === 'identifier') name = fn.text;
    else if (fn.type === 'selector_expression') {
      name = fn.childForFieldName('field')?.text ?? '';
      const operand = fn.childForFieldName('operand');
      if (operand?.type === 'identifier') receiver = operand.text;
    }
    const key = `${receiver ?? ''}.${name}`;
    if (!name || seen.has(key) || out.length >= 80) continue;
    seen.add(key);
    out.push(receiver ? { name, receiver } : { name });
  }
  return out;
}

function extract(root: Node): Extracted {
  const imports: RawImport[] = [];
  const symbols: SymbolInfo[] = [];

  for (const top of root.namedChildren) {
    if (!top) continue;
    if (top.type === 'import_declaration') {
      for (const spec of top.descendantsOfType('import_spec')) {
        const p = spec?.childForFieldName('path')?.text.slice(1, -1); // drop the quotes
        if (!spec || !p) continue;
        const alias = spec.childForFieldName('name')?.text;
        if (alias === '_') continue; // imported only for its side effects
        imports.push({ spec: p, line: line(spec), bindings: [{ local: alias ?? p.split('/').pop()!, imported: '*' }], kind: 'static' });
      }
    } else if (top.type === 'function_declaration') {
      const name = top.childForFieldName('name')?.text;
      if (name) symbols.push({ name, kind: 'function', startLine: line(top), endLine: endLine(top), exported: isPublic(name), calls: collectCalls(top) });
    } else if (top.type === 'method_declaration') {
      const name = top.childForFieldName('name')?.text;
      // the receiver looks like (s *Server): the type name is the class this method belongs to
      const parent = top.childForFieldName('receiver')?.descendantsOfType('type_identifier')[0]?.text;
      if (name) symbols.push({ name, kind: 'method', startLine: line(top), endLine: endLine(top), exported: isPublic(name), parent, calls: collectCalls(top) });
    } else if (top.type === 'type_declaration') {
      for (const spec of top.descendantsOfType('type_spec')) {
        const name = spec?.childForFieldName('name')?.text;
        if (spec && name) symbols.push({ name, kind: 'class', startLine: line(spec), endLine: endLine(spec), exported: isPublic(name), calls: [] });
      }
    }
  }
  return { imports, symbols };
}

/**
 * Go imports whole folders ("packages"), e.g. "github.com/me/app/util". We find the project folder whose path
 * ends the same way as the import ("util"), and point at its main file. Standard-library and outside packages
 * don't match any folder, so they stay "outside".
 */
function createResolver(_root: string, files: Set<string>): Resolver {
  const folders = new Map<string, string>(); // folder -> the file we point at
  for (const f of [...files].filter((f) => f.endsWith('.go') && !f.endsWith('_test.go')).sort()) {
    const dir = path.posix.dirname(f);
    const preferred = `${dir}/${path.posix.basename(dir)}.go`; // util/util.go beats util/zebra.go
    if (!folders.has(dir) || f === preferred) folders.set(dir, f);
  }
  return (spec) => {
    const parts = spec.split('/');
    for (let n = parts.length; n >= 1; n--) {
      const hit = folders.get(parts.slice(-n).join('/'));
      if (hit) return hit;
    }
    return null;
  };
}

export default defineLanguage({
  id: 'go',
  label: 'Go',
  extensions: ['.go'],
  grammar: () => 'go',
  commentPrefix: '//',
  extract,
  createResolver,
});
