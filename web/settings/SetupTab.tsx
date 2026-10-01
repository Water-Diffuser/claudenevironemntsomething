// "Setup": save your whole setup to one file, load one, or start over.
import { useRef, useState } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { defaultUI, useSettings } from '../state/settings';
import { useApp } from '../state/store';
import { Section } from './controls';
import { download, exportSetup, importSetup } from './setup';

export function SetupTab() {
  const ui = useSettings((s) => s.ui);
  const replaceAll = useSettings((s) => s.replaceAll);
  const toast = useApp((s) => s.toast);
  const file = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (f.size > 1_000_000) throw new Error('That file is too big to be a setup file.');
      replaceAll(importSetup(await f.text(), useSettings.getState().ui));
      toast(`Loaded the setup from ${f.name}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read that file.', 'error');
    }
    if (file.current) file.current.value = '';
  };

  return (
    <>
      <Section title="Your setup" hint="Theme, colors, layouts, names, feature switches and sound volumes in one JSON file. Share it, back it up, or move it to another computer. Your earned Dishes stay where they are.">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary !py-1 text-xs" onClick={() => download('indulgent-setup.json', exportSetup(ui))}>
            <Download size={14} /> Export
          </button>
          <button className="btn !py-1 text-xs" onClick={() => file.current?.click()}>
            <Upload size={14} /> Import…
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <p className="text-xs text-dim">
          Everything you change is saved automatically to <code className="font-mono text-accent-2">data/settings.json</code>. Delete that file to go back to the defaults in <code className="font-mono text-accent-2">indulgent.config.ts</code>.
        </p>
      </Section>

      <Section title="Start over">
        {!confirmReset ? (
          <button className="btn btn-danger !py-1 text-xs" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} /> Reset my setup
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-bad p-3 text-sm">
            <p>Go back to the default look, layouts, names and volumes? (Your Dishes are kept.)</p>
            <div className="flex gap-2">
              <button className="btn btn-danger !py-1 text-xs" onClick={() => (replaceAll({ ...defaultUI(), dishes: ui.dishes }), setConfirmReset(false))}>
                Yes, reset
              </button>
              <button className="btn !py-1 text-xs" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
