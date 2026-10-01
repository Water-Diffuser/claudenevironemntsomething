// We import Monaco's pieces by their deep paths (so we can skip the heavy TypeScript/JSON
// language-service workers). These lines just tell TypeScript what those paths are.
declare module 'monaco-editor/editor/editor.api' {
  export * from 'monaco-editor';
}
declare module 'monaco-editor/basic-languages/monaco.contribution';
declare module 'monaco-editor/editor/editor.worker?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
