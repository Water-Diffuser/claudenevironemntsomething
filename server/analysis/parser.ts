// ============================================================================
//  parser.ts: tree-sitter, the library that reads source code into a tree.
//  It runs as WebAssembly, so nothing needs compiling on your computer.
// ============================================================================
import path from 'node:path';
import { createRequire } from 'node:module';
import { Language, Parser, type Node } from 'web-tree-sitter';

const require = createRequire(import.meta.url);
/** Folder holding the prebuilt grammars (one .wasm file per language). */
const WASM_DIR = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');

let ready: Promise<void> | null = null;
const languages = new Map<string, Promise<Language | null>>();
const parsers = new Map<string, Parser>();

function init() {
  return (ready ??= Parser.init());
}

async function loadGrammar(name: string): Promise<Language | null> {
  await init();
  let p = languages.get(name);
  if (!p) {
    p = Language.load(path.join(WASM_DIR, `tree-sitter-${name}.wasm`)).catch((err) => {
      console.warn(`  [analysis] could not load the "${name}" grammar:`, String(err?.message ?? err));
      return null;
    });
    languages.set(name, p);
  }
  return p;
}

/**
 * Parse `source` with the given grammar and run `fn` on the root node.
 * (The tree must be freed afterwards, which is why we use a callback.)
 */
export async function withTree<T>(grammar: string, source: string, fn: (root: Node) => T): Promise<T | null> {
  const lang = await loadGrammar(grammar);
  if (!lang) return null;
  let parser = parsers.get(grammar);
  if (!parser) {
    parser = new Parser();
    parser.setLanguage(lang);
    parsers.set(grammar, parser);
  }
  const tree = parser.parse(source);
  if (!tree) return null;
  try {
    return fn(tree.rootNode);
  } finally {
    tree.delete();
  }
}
