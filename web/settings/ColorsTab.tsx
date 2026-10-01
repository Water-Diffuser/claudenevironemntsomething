// "Color code": what each color MEANS (read, searched, edited...). The same colors are used on every panel.
import { RotateCcw } from 'lucide-react';
import { config } from '@config';
import { KINDS, type Kind } from '@shared/events';
import { useKindLabels, useSettings } from '../state/settings';
import { resolveColorCode, resolveTheme } from '../theme/applyTheme';
import { Section } from './controls';

export function ColorsTab() {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const labels = useKindLabels();
  const code = resolveColorCode(resolveTheme(ui.theme), ui.colorCode);
  const edited = Object.keys(ui.colorCode).length > 0 || Object.keys(ui.kindLabels).length > 0;

  return (
    <Section
      title="Color code"
      hint="One color per kind of action, used on the map, graph, code view, piano roll and everywhere else. Change the color, the word, or both."
      actions={
        <button className="btn btn-ghost !px-1.5 !py-0.5 text-xs" disabled={!edited} onClick={() => update({ colorCode: {}, kindLabels: {} })}>
          <RotateCcw size={12} /> reset
        </button>
      }
    >
      {(KINDS as Kind[]).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${labels[k]} color`}
            value={/^#[0-9a-f]{6}$/i.test(code[k]) ? code[k] : '#000000'}
            onChange={(e) => update({ colorCode: { ...ui.colorCode, [k]: e.target.value } })}
            className="h-7 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
          />
          <input
            className="field !py-1 text-sm font-semibold"
            style={{ color: 'var(--k-' + k + ')' }}
            aria-label={`Word for ${k}`}
            value={ui.kindLabels[k] ?? ''}
            placeholder={config.kindLabels[k]}
            onChange={(e) => {
              const { [k]: _old, ...rest } = ui.kindLabels;
              update({ kindLabels: e.target.value ? { ...rest, [k]: e.target.value } : rest });
            }}
          />
        </div>
      ))}
      <p className="pt-1 text-xs text-dim">Tip: keep the colors far apart from each other. They are the one thing you look at without reading.</p>
    </Section>
  );
}

