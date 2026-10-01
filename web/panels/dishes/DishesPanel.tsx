// ============================================================================
//  "Trophy Case": every Dish (achievement) you can earn. Locked ones show a
//  hint; earned ones show when. They are saved in your settings, so they stay.
// ============================================================================
import { Lock, Trophy } from 'lucide-react';
import { DISHES } from '../../state/dishes';
import { useSettings } from '../../state/settings';

export default function DishesPanel() {
  const earned = useSettings((s) => s.ui.dishes);
  const count = DISHES.filter((d) => earned[d.id] !== undefined).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
        <Trophy size={14} className="text-warn" />
        <span className="font-semibold">
          {count} / {DISHES.length}
        </span>
        <span className="text-dim">dishes earned</span>
        <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-line/50" aria-hidden>
          <div className="h-full bg-warn" style={{ width: `${(count / DISHES.length) * 100}%` }} />
        </div>
      </div>
      <ul className="m-0 grid min-h-0 flex-1 list-none grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2 overflow-y-auto p-2">
        {DISHES.map((dish) => {
          const when = earned[dish.id];
          const got = when !== undefined;
          const Icon = dish.icon;
          return (
            <li key={dish.id} className={`flex flex-col items-center rounded-lg border px-2 py-3 text-center transition ${got ? 'gloss border-accent/70 bg-accent/10' : 'border-line bg-surface/40 opacity-70'}`}>
              <div className={`mb-1.5 grid size-12 place-items-center rounded-full border-2 ${got ? 'border-accent bg-accent/15 text-accent-2 glow' : 'border-dashed border-line text-dim'}`}>{got ? <Icon size={24} /> : <Lock size={18} />}</div>
              <div className={`font-display text-base leading-tight ${got ? '' : 'text-dim'}`}>{got ? dish.name : '???'}</div>
              <div className="mt-0.5 text-[0.7rem] leading-snug text-dim">{got ? dish.blurb : dish.hint}</div>
              {got && <div className="mt-1 text-[0.62rem] uppercase tracking-wider text-accent-2">{new Date(when).toLocaleDateString()}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
