// "Words": rename any label in the app. Leave a box empty to use the original name.
// (The words for READ / SEARCHED / EDITED... are in the Colors tab, next to their colors.)
import { RotateCcw } from 'lucide-react';
import { config } from '@config';
import { useSettings, type LabelKey } from '../state/settings';
import { Section } from './controls';

export function WordsTab() {
  const labels = useSettings((s) => s.ui.labels);
  const update = useSettings((s) => s.update);
  const keys = Object.keys(config.labels) as LabelKey[];
  return (
    <Section
      title="Names"
      hint="Rename anything. Panels, meters, buttons: the new name shows up everywhere straight away."
      actions={
        <button className="btn btn-ghost !px-1.5 !py-0.5 text-xs" disabled={!Object.keys(labels).length} onClick={() => update({ labels: {} })}>
          <RotateCcw size={12} /> reset all
        </button>
      }
    >
      {keys.map((k) => (
        <label key={k} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs">
          <span className="truncate text-dim" title={k}>
            {k}
          </span>
          <input
            className="field !py-1 text-sm"
            value={labels[k] ?? ''}
            placeholder={config.labels[k]}
            onChange={(e) => {
              const { [k]: _old, ...rest } = labels;
              update({ labels: e.target.value ? { ...rest, [k]: e.target.value } : rest });
            }}
          />
        </label>
      ))}
    </Section>
  );
}
