// ============================================================================
//  "Trophy Case": every Dish (achievement) you can earn. Locked ones show a
//  hint; earned ones show when. They are saved in your settings, so they stay.
// ============================================================================
import { Lock } from 'lucide-react';
import { DISHES } from '../../state/dishes';
import { useSettings } from '../../state/settings';

export default function DishesPanel() {
  const earned = useSettings((s) => s.ui.dishes);
  const count = DISHES.filter((d) => earned[d.id] !== undefined).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-xs">
        <span className="text-ink">
          {count} of {DISHES.length}
        </span>
        <span className="text-dim">dishes earned</span>
        <div className="ml-auto h-[3px] w-24 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full bg-accent" style={{ width: `${(count / DISHES.length) * 100}%` }} />
        </div>
      </div>
      {/* a plain list, not a grid of cards: earned dishes are bright, locked ones are dim */}
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {DISHES.map((dish) => {
          const when = earned[dish.id];
          const got = when !== undefined;
          const Icon = dish.icon;
          return (
            <li key={dish.id} className={`flex items-center gap-3 border-b border-line px-3 py-2.5 ${got ? '' : 'opacity-60'}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full border ${got ? 'border-accent text-accent' : 'border-dashed border-line text-dim'}`}>{got ? <Icon size={14} /> : <Lock size={12} />}</span>
              <div className="min-w-0 flex-1">
                <div className={`font-display text-base leading-tight ${got ? 'text-ink' : 'text-dim'}`}>{got ? dish.name : '???'}</div>
                <div className="text-xs leading-snug text-dim">{got ? dish.blurb : dish.hint}</div>
              </div>
              {got && <div className="shrink-0 text-xs text-dim">{new Date(when).toLocaleDateString()}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
