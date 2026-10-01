// ============================================================================
//  JavaScript + TypeScript (+ JSX/TSX) support.
//  This file is a good template if you want to teach the analyzer a new language.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import type { CallRef, SymbolInfo } from '../../../shared/scan.ts';
import { defineLanguage, type Extracted, type RawImport, type Resolver } from './types.ts';

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const FUNCTION_VALUES = new Set(['arrow_function', 'function_expression', 'function', 'generator_function']);

const line = (n: Node) => n.startPosition.row + 1;
const endLine = (n: Node) => n.endPosition.row + 1;
const unquote = (s: string) => s.replace(/^['"`]|['"`]$/g, '');

// ---- finding calls inside a function/class ---------------------------------------
function collectCalls(body: Node): CallRef[] {
  const seen = new Set<string>();
  const out: CallRef[] = [];
  const add = (name: string, receiver?: string) => {
    const key = `${receiver ?? ''}.${name}`;
    if (!name || seen.has(key) || out.length >= 80) return;
    seen.add(key);
    out.push(receiver ? { name, receiver } : { name });
  };
  const fromCallee = (fn: Node | null) => {
    if (!fn) return;
    if (fn.type === 'identifier') add(fn.text);
    else if (fn.type === 'member_expression') {
      const prop = fn.childForFieldName('property');
      let obj = fn.childForFieldName('object');
      // a.b.c() -> receiver "a"
      while (obj && obj.type === 'member_expression') obj = obj.childForFieldName('object');
      if (prop) add(prop.text, obj && (obj.type === 'identifier' || obj.type === 'this') ? obj.text : undefined);
    }
  };
  for (const n of body.descendantsOfType(['call_expression', 'new_expression', 'jsx_opening_element', 'jsx_self_closing_element'])) {
    if (!n) continue;
    if (n.type === 'call_expression') fromCallee(n.childForFieldName('function'));
    else if (n.type === 'new_expression') fromCallee(n.childForFieldName('constructor'));
    else {
      // <Button /> counts as using Button (only components, which start with a capital letter)
      const nm = n.childForFieldName('name');
      if (nm && /^[A-Z]/.test(nm.text.split('.')[0])) add(nm.text.split('.')[0]);
    }
  }
  return out;
}

// ---- imports ---------------------------------------------------------------------
function importFromStatement(node: Node): RawImport | null {
  const src = node.childForFieldName('source');
  if (!src) return null;
  const bindings: RawImport['bindings'] = [];
  const clause = node.namedChildren.find((c) => c?.type === 'import_clause');
  for (const c of clause?.namedChildren ?? []) {
    if (!c) continue;
    if (c.type === 'identifier') bindings.push({ local: c.text, imported: 'default' });
    else if (c.type === 'namespace_import') {
      const id = c.namedChildren.find((x) => x?.type === 'identifier');
      if (id) bindings.push({ local: id.text, imported: '*' });
    } else if (c.type === 'named_imports') {
      for (const spec of c.namedChildren) {
        if (spec?.type !== 'import_specifier') continue;
        const name = spec.childForFieldName('name')?.text;
        const alias = spec.childForFieldName('alias')?.text;
        if (name) bindings.push({ local: alias ?? name, imported: name });
      }
    }
  }
  return { spec: unquote(src.text), line: line(node), bindings, kind: 'static', typeOnly: /^import\s+type\b/.test(node.text) };
}

function reexportFromStatement(node: Node): RawImport | null {
  const src = node.childForFieldName('source');
  if (!src) return null;
  const bindings: RawImport['bindings'] = [];
  for (const c of node.namedChildren) {
    if (c?.type === 'export_clause') {
      for (const spec of c.namedChildren) {
        const name = spec?.childForFieldName('name')?.text;
        const alias = spec?.childForFieldName('alias')?.text;
        if (name) bindings.push({ local: alias ?? name, imported: name });
      }
    }
  }
  return { spec: unquote(src.text), line: line(node), bindings, kind: 'reexport' };
}

/** require('x') and import('x'). */
function importFromCall(node: Node): RawImport | null {
  const fn = node.childForFieldName('function');
  if (!fn) return null;
  const isRequire = fn.type === 'identifier' && fn.text === 'require';
  const isDynamic = fn.type === 'import';
  if (!isRequire && !isDynamic) return null;
  const arg = node.childForFieldName('arguments')?.namedChildren[0];
  if (!arg || arg.type !== 'string') return null;
  const bindings: RawImport['bindings'] = [];
  // const x = require('y')  /  const { a, b } = require('y')
  const decl = node.parent;
  if (isRequire && decl?.type === 'variable_declarator') {
    const target = decl.childForFieldName('name');
    if (target?.type === 'identifier') bindings.push({ local: target.text, imported: '*' });
    else if (target?.type === 'object_pattern') {
      for (const p of target.namedChildren) {
        if (p?.type === 'shorthand_property_identifier_pattern') bindings.push({ local: p.text, imported: p.text });
        else if (p?.type === 'pair_pattern') {
          const k = p.childForFieldName('key')?.text;
          const v = p.childForFieldName('value')?.text;
          if (k && v) bindings.push({ local: v, imported: k });
        }
      }
    }
  }
  return { spec: unquote(arg.text), line: line(node), bindings, kind: isRequire ? 'require' : 'dynamic' };
}

// ---- symbols ---------------------------------------------------------------------
function symbolsFromStatement(node: Node, exported: boolean, out: SymbolInfo[]) {
  const push = (name: string, kind: SymbolInfo['kind'], range: Node, body: Node | null, parent?: string) =>
    out.push({ name, kind, startLine: line(range), endLine: endLine(range), exported, parent, calls: body ? collectCalls(body) : [] });

  switch (node.type) {
    case 'function_declaration':
    case 'generator_function_declaration': {
      push(node.childForFieldName('name')?.text ?? 'default', 'function', node, node);
      break;
    }
    case 'class_declaration':
    case 'abstract_class_declaration':
    case 'class': {
      const name = node.childForFieldName('name')?.text ?? 'default';
      push(name, 'class', node, null);
      const body = node.childForFieldName('body');
      for (const m of body?.namedChildren ?? []) {
        if (!m) continue;
        if (m.type === 'method_definition') {
          const mn = m.childForFieldName('name')?.text;
          if (mn) out.push({ name: mn, kind: 'method', startLine: line(m), endLine: endLine(m), exported, parent: name, calls: collectCalls(m) });
        } else if (m.type === 'public_field_definition' || m.type === 'field_definition') {
          const value = m.childForFieldName('value');
          const mn = (m.childForFieldName('name') ?? m.childForFieldName('property'))?.text;
          if (mn && value && FUNCTION_VALUES.has(value.type)) out.push({ name: mn, kind: 'method', startLine: line(m), endLine: endLine(m), exported, parent: name, calls: collectCalls(value) });
        }
      }
      break;
    }
    case 'lexical_declaration':
    case 'variable_declaration': {
      for (const d of node.namedChildren) {
        if (d?.type !== 'variable_declarator') continue;
        const name = d.childForFieldName('name');
        const value = d.childForFieldName('value');
        if (name?.type === 'identifier' && value && FUNCTION_VALUES.has(value.type)) push(name.text, 'function', node, value);
      }
      break;
    }
    case 'interface_declaration':
    case 'type_alias_declaration':
    case 'enum_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) push(name, 'type', node, null);
      break;
    }
    case 'expression_statement': {
      // exports.foo = function () {}   /   module.exports.foo = () => {}
      const a = node.namedChildren[0];
      if (a?.type === 'assignment_expression') {
        const left = a.childForFieldName('left');
        const right = a.childForFieldName('right');
        if (left?.type === 'member_expression' && right && FUNCTION_VALUES.has(right.type) && /^(module\.)?exports\./.test(left.text)) {
          out.push({ name: left.childForFieldName('property')?.text ?? 'default', kind: 'function', startLine: line(node), endLine: endLine(node), exported: true, calls: collectCalls(right) });
        }
      }
      break;
    }
  }
}

function extract(root: Node): Extracted {
  const imports: RawImport[] = [];
  const symbols: SymbolInfo[] = [];
  const exportedNames = new Set<string>();

  for (const stmt of root.namedChildren) {
    if (!stmt) continue;
    if (stmt.type === 'import_statement') {
      const imp = importFromStatement(stmt);
      if (imp) imports.push(imp);
    } else if (stmt.type === 'export_statement') {
      const re = reexportFromStatement(stmt);
      if (re) imports.push(re);
      const decl = stmt.childForFieldName('declaration') ?? stmt.childForFieldName('value');
      if (decl) symbolsFromStatement(decl, true, symbols);
      // export { a, b };  (no "from")
      if (!stmt.childForFieldName('source')) {
        for (const c of stmt.namedChildren) {
          if (c?.type === 'export_clause') for (const s of c.namedChildren) exportedNames.add(s?.childForFieldName('name')?.text ?? '');
          else if (c?.type === 'identifier') exportedNames.add(c.text); // export default foo;
        }
      }
    } else {
      symbolsFromStatement(stmt, false, symbols);
    }
  }
  for (const s of symbols) if (exportedNames.has(s.name)) s.exported = true;

  // require() and import() can be anywhere in the file, so look at every call.
  for (const call of root.descendantsOfType('call_expression')) {
    const imp = call && importFromCall(call);
    if (imp) imports.push(imp);
  }
  return { imports, symbols };
}

// ---- turning import text into a file path ----------------------------------------
/** Read tsconfig.json / jsconfig.json (they allow comments, so strip those first). */
function readJsonLoose(file: string): any | null {
  try {
    let text = fs.readFileSync(file, 'utf8');
    let out = '';
    let inStr = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        out += c;
        if (c === '\\') out += text[++i] ?? '';
        else if (c === '"') inStr = false;
      } else if (c === '"') (inStr = true), (out += c);
      else if (c === '/' && text[i + 1] === '/') while (i < text.length && text[i] !== '\n') i++;
      else if (c === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i++;
      } else out += c;
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

function createResolver(root: string, files: Set<string>): Resolver {
  // Path aliases such as "@/*": ["src/*"] from tsconfig.json
  const aliases: Array<{ prefix: string; suffix: string; targets: string[]; wildcard: boolean }> = [];
  let baseUrl = '';
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const cfg = readJsonLoose(path.join(root, name));
    const co = cfg?.compilerOptions;
    if (!co) continue;
    baseUrl = co.baseUrl ? path.posix.normalize(String(co.baseUrl)).replace(/^\.$/, '') : baseUrl;
    for (const [pattern, targets] of Object.entries<string[]>(co.paths ?? {})) {
      const star = pattern.indexOf('*');
      aliases.push({
        prefix: star >= 0 ? pattern.slice(0, star) : pattern,
        suffix: star >= 0 ? pattern.slice(star + 1) : '',
        wildcard: star >= 0,
        targets: targets.map((t) => path.posix.normalize(t).replace(/^\.\//, '')),
      });
    }
    break;
  }

  /** Try "file", then with each extension, then as a folder with an index file. */
  const probe = (base: string): string | null => {
    base = path.posix.normalize(base);
    if (base.startsWith('../')) return null;
    const candidates = [base];
    // TypeScript projects often write "./foo.js" for a file that is really foo.ts
    const m = /\.(m|c)?jsx?$/.exec(base);
    if (m) {
      const stem = base.slice(0, -m[0].length);
      candidates.push(stem + '.ts', stem + '.tsx', stem + '.mts', stem + '.cts');
    }
    for (const e of EXTS) candidates.push(base + e);
    for (const e of EXTS) candidates.push(`${base}/index${e}`);
    candidates.push(base + '.json', base + '.css');
    return candidates.find((c) => files.has(c)) ?? null;
  };

  return (spec, fromFile) => {
    if (spec.startsWith('.')) return probe(path.posix.join(path.posix.dirname(fromFile), spec));
    for (const a of aliases) {
      if (a.wildcard ? spec.startsWith(a.prefix) && spec.endsWith(a.suffix) && spec.length >= a.prefix.length + a.suffix.length : spec === a.prefix) {
        const mid = a.wildcard ? spec.slice(a.prefix.length, spec.length - a.suffix.length) : '';
        for (const t of a.targets) {
          const hit = probe(path.posix.join(baseUrl, t.replace('*', mid)));
          if (hit) return hit;
        }
      }
    }
    // "src/utils" style imports relative to baseUrl
    if (baseUrl !== '' || files.size) {
      const hit = baseUrl ? probe(path.posix.join(baseUrl, spec)) : null;
      if (hit) return hit;
    }
    return null; // an outside package (react, express...)
  };
}

export default defineLanguage({
  id: 'typescript',
  label: 'JavaScript / TypeScript',
  extensions: EXTS,
  grammar: (ext) => (ext === '.tsx' ? 'tsx' : ext === '.ts' || ext === '.mts' || ext === '.cts' ? 'typescript' : 'javascript'),
  commentPrefix: '//',
  extract,
  createResolver,
});
