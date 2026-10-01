// Small form controls shared by the settings tabs.
import type { ReactNode } from 'react';

/** A titled group of controls. */
export function Section({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-display text-[0.8rem] uppercase tracking-[0.16em] text-accent-2">{title}</h3>
        <div className="ml-auto">{actions}</div>
      </div>
      {hint && <p className="mb-2 text-xs text-dim">{hint}</p>}
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function Slider({
  label, value, min, max, step = 0.01, onChange, format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block text-xs">
      <span className="flex justify-between text-dim">
        {label}
        <span className="font-mono text-ink">{format ? format(value) : value}</span>
      </span>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

/** A color swatch (the browser's color picker) with its hex code. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // <input type=color> only understands #rrggbb
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-mono text-dim">{hex}</span>
    </label>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </span>
    </label>
  );
}
