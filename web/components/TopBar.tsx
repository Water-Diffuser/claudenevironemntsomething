// The strip across the top: logo, project, mode, permission mode, connection light.
import { FolderOpen, PanelLeft, Radio, SlidersHorizontal, Theater } from 'lucide-react';
import { config } from '@config';
import type { Mode, PermissionModeName } from '@shared/protocol';
import { send, useApp, useView } from '../state/store';
import { goLive } from '../state/replay';
import { useLabel, useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { allLayouts, switchLayout } from '../settings/layouts';
import { SoundControl } from './SoundControl';

const PERMISSION_LABELS: Record<PermissionModeName, string> = {
  default: 'Ask me first',
  acceptEdits: 'Auto-accept edits',
  plan: 'Plan only',
};

export function TopBar() {
  const server = useApp((s) => s.server);
  const conn = useApp((s) => s.conn);
  const openPicker = useUI((s) => s.openPicker);
  const sidebarOpen = useSettings((s) => s.ui.sidebarOpen);
  const update = useSettings((s) => s.update);
  const ui = useSettings((s) => s.ui);
  const settingsOpen = useUI((s) => s.settingsOpen);
  const openSettings = useUI((s) => s.openSettings);
  const settingsLabel = useLabel('settings');
  const project = useLabel('project');
  const busy = !!server?.busy;
  const replaying = useView((s) => !!s.replay);
  const name = server?.cwd?.split('/').filter(Boolean).pop();

  const modeBtn = (mode: Mode, Icon: typeof Radio, title: string) => (
    <button
      key={mode}
      title={title}
      disabled={busy}
      onClick={() => send({ t: 'set_mode', mode })}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition ${server?.mode === mode ? 'bg-accent text-on-accent' : 'text-dim hover:text-ink'}`}
    >
      <Icon size={13} /> <span className="max-lg:hidden">{mode}</span>
    </button>
  );

  return (
    <header className="gloss flex h-[var(--topbar-h)] shrink-0 items-center gap-3 overflow-hidden border-b border-line bg-surface/80 px-3 max-lg:gap-2">
      <button className="btn btn-ghost !p-1.5" onClick={() => update({ sidebarOpen: !sidebarOpen })} aria-label="Toggle setlist" title="Toggle setlist">
        <PanelLeft size={18} />
      </button>
      <div className="glitch glow-text font-display text-xl font-semibold tracking-[0.18em] text-accent max-md:hidden" data-text={config.app.name}>
        {config.app.name}
      </div>
      <span className="hidden text-xs italic text-dim xl:inline">{config.app.tagline}</span>

      <button className="btn min-w-0 max-w-[22rem] !py-1 lg:ml-2" onClick={() => openPicker(true)} title={server?.cwd ?? `Choose a ${project}`}>
        <FolderOpen size={16} className="shrink-0 text-accent" />
        <span className="truncate">{name ?? `Choose a ${project}`}</span>
      </button>

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3 max-lg:gap-2">
        <select
          className="field !w-auto !py-1 text-xs max-lg:max-w-[7.5rem]"
          value={server?.permissionMode ?? 'default'}
          onChange={(e) => send({ t: 'set_permission_mode', mode: e.target.value as PermissionModeName })}
          aria-label="Permission mode"
          title="How much may Claude do without asking?"
        >
          {(Object.keys(PERMISSION_LABELS) as PermissionModeName[]).map((m) => (
            <option key={m} value={m}>
              {PERMISSION_LABELS[m]}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-[var(--radius)] border border-line" role="group" aria-label="Mode">
          {modeBtn('live', Radio, server?.liveAvailable ? 'Real Claude Code' : 'Real Claude (no credentials found yet)')}
          {modeBtn('rehearsal', Theater, 'Scripted fake session: free, touches nothing')}
        </div>
        {replaying && (
          <button className="btn btn-primary !px-2.5 !py-1 text-xs" onClick={goLive} title="You are looking at the past. Click to return to now.">
            ⏪ REPLAY · back to live
          </button>
        )}
        <select className="field !w-auto !py-1 text-xs max-lg:max-w-[6.5rem]" value={ui.layout} onChange={(e) => switchLayout(e.target.value)} aria-label="Layout" title="Switch layout">
          {Object.entries(allLayouts(ui)).map(([key, l]) => (
            <option key={key} value={key}>
              {l.label}
            </option>
          ))}
        </select>
        <SoundControl />
        <button className={`btn !px-2 !py-1 ${settingsOpen ? 'border-accent text-accent-2' : ''}`} onClick={() => openSettings(!settingsOpen)} aria-expanded={settingsOpen} aria-label={settingsLabel} title={settingsLabel}>
          <SlidersHorizontal size={16} />
        </button>
        <span className="flex items-center gap-1.5 text-xs text-dim" title={`backend: ${conn}`}>
          <span className={`inline-block size-2 rounded-full ${conn === 'open' ? 'bg-good' : conn === 'connecting' ? 'animate-pulse bg-warn' : 'bg-bad'}`} />
          <span className="max-xl:hidden">{conn === 'open' ? (busy ? 'working' : 'ready') : conn}</span>
        </span>
      </div>
    </header>
  );
}
