// Open a file in the editor from anywhere (a click in the explorer, the map, a diff...).
import { useBuffers } from '../state/buffers';
import { useEditor } from '../state/editor';
import { showPanel } from '../settings/layouts';
import { useUI } from '../state/ui';

export function openFile(path: string, opts: { preview?: boolean; line?: number } = {}) {
  const editor = useEditor.getState();
  editor.setFollow(false); // you picked a file yourself, so stop jumping to wherever Claude is
  editor.open(path, { preview: opts.preview ?? false });
  void useBuffers.getState().load(path);
  showPanel('code');
  if (opts.line) useUI.getState().jump(path, opts.line);
}
