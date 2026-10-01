// ============================================================================
//  monaco.ts: sets up the Monaco code editor (the editor inside VS Code).
//  Everything is bundled locally, so it works offline. We load the core editor
//  plus the lightweight syntax-coloring definitions (no TypeScript language
//  server), which keeps it fast.
// ============================================================================
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/basic-languages/monaco.contribution';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import type { ThemeColors } from './themeColors';

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Tell @monaco-editor/react to use OUR bundled copy instead of downloading one from a CDN.
loader.config({ monaco });

export { monaco };

/** Map a file path to a Monaco language id. */
const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', json: 'json', md: 'markdown', mdx: 'markdown', css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
  sh: 'shell', bash: 'shell', zsh: 'shell', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  rb: 'ruby', php: 'php', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', swift: 'swift',
  sql: 'sql', lua: 'lua', dockerfile: 'dockerfile', vue: 'html', svelte: 'html',
};
export function languageFor(path: string): string {
  const name = path.split('/').pop() ?? path;
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  return LANG_BY_EXT[ext] ?? 'plaintext';
}

/** Build a Monaco color theme from our CSS-variable theme, so the editor matches the rest of the UI. */
export function defineIndulgentTheme(c: ThemeColors, dark: boolean) {
  const strip = (hex: string) => hex.replace('#', '');
  monaco.editor.defineTheme('indulgent', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: strip(c.textDim), fontStyle: 'italic' },
      { token: 'keyword', foreground: strip(c.accent) },
      { token: 'string', foreground: strip(c.kind.create) },
      { token: 'number', foreground: strip(c.kind.run) },
      { token: 'type', foreground: strip(c.kind.search) },
      { token: 'identifier', foreground: strip(c.text) },
      { token: 'delimiter', foreground: strip(c.textDim) },
    ],
    colors: {
      'editor.background': c.surface,
      'editor.foreground': c.text,
      'editorLineNumber.foreground': c.textDim,
      'editorLineNumber.activeForeground': c.accent2,
      'editor.lineHighlightBackground': c.surfaceHi + '55',
      'editor.selectionBackground': c.accent + '44',
      'editorCursor.foreground': c.accent,
      'editorGutter.background': c.surface,
      'minimap.background': c.bgAlt,
      'minimapSlider.background': c.accent + '33',
      'minimapSlider.hoverBackground': c.accent + '55',
      'minimapSlider.activeBackground': c.accent + '77',
      'scrollbarSlider.background': c.accent + '33',
      'scrollbarSlider.hoverBackground': c.accent + '55',
      'editorWidget.background': c.surfaceHi,
      'editorIndentGuide.background1': c.border + '66',
    },
  });
}
