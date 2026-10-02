// ============================================================================
//  The top bar: ONE quiet row.
//    left   sessions button, wordmark, project
//    right  the HUD meters, live/rehearsal, layout menu, sound, settings, connection light
//  Anything that is only changed now and then (permission mode, model, effort) lives
//  next to the message box instead, where you actually use it.
//  The 2px "on air" line along the bottom edge sweeps while Claude is working.
// ============================================================================
import { Check, ChevronDown, FolderOpen, History, LayoutGrid, MoveDiagonal, PanelLeft, Radio, SlidersHorizontal, Theater } from 'lucide-react';
import { config } from '@config';
import { send, useApp, useView } from '../state/store';
import { goLive } from '../state/replay';
import { isFeatureOn, useLabel, useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { allLayouts, currentLayoutKey, switchLayout } from '../settings/layouts';
import { HudBar } from './HudBar';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu';
import { SoundControl } from './SoundControl';

export function TopBar() {
  const server = useApp((s) => s.server);
  const conn = useApp((s) => s.conn);
  const openPicker = useUI((s) => s.openPicker);
  const arranging = useUI((s) => s.arranging);
  const setArranging = useUI((s) => s.setArranging);
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const settingsOpen = useUI((s) => s.settingsOpen);
  const openSettings = useUI((s) => s.openSettings);
  const settingsLabel = useLabel('settings');
  const projectLabel = useLabel('project');
  const setlistLabel = useLabel('setlist');
  const busy = !!server?.busy;
  const replaying = useView((s) => !!s.replay);
  const name = server?.cwd?.split('/').filter(Boolean).pop();
  const live = server?.mode === 'live';
  const layoutKey = currentLayoutKey(ui);

  return (
    <header className="relative z-30 flex shrink-0 items-center gap-2 border-b border-line bg-bg-alt px-3" style={{ height: 'var(--topbar-h)' }}>
      <button className="icon-btn" aria-label={`${setlistLabel} (your sessions)`} title={`${setlistLabel}: your sessions`} aria-pressed={ui.sidebarOpen} onClick={() => update({ sidebarOpen: !ui.sidebarOpen })}>
        <PanelLeft size={17} />
      </button>

      {/* the wordmark: serif capitals with a small "record light" in front */}
      <div className="flex shrink-0 items-center gap-2 pr-1 max-md:hidden" title={config.app.tagline}>
        <span className="size-1.5 rounded-full bg-accent glow" aria-hidden />
        <span className="glitch font-display text-base font-semibold uppercase tracking-[0.24em]" data-text={config.app.name}>
          {config.app.name}
        </span>
      </div>

      <button className="btn min-w-0 max-w-[13rem]" onClick={() => openPicker(true)} title={server?.cwd ?? `Choose a ${projectLabel}`}>
        <FolderOpen size={14} className="shrink-0 text-dim" />
        <span className="truncate">{name ?? `Choose a ${projectLabel}`}</span>
      </button>

      {replaying && (
        <button className="btn btn-primary" onClick={goLive} title="You are looking at the past. Click to return to now.">
          <History size={14} /> <span className="max-lg:hidden">Back to live</span>
        </button>
      )}
      {arranging && (
        <button className="btn btn-primary" onClick={() => setArranging(false)} title="Finish moving panels around">
          <Check size={14} /> Done arranging
        </button>
      )}

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {isFeatureOn(ui, 'hud') && <HudBar />}

        <div className="flex items-center gap-1">
          {/* live <-> rehearsal */}
          <button
            className="btn !px-2"
            disabled={busy}
            onClick={() => send({ t: 'set_mode', mode: live ? 'rehearsal' : 'live' })}
            title={live ? 'Real Claude Code is answering. Click to switch to Rehearsal (a scripted fake session: free, touches nothing).' : server?.liveAvailable ? 'Rehearsal: a scripted fake session that touches nothing. Click to switch to real Claude Code.' : 'Rehearsal: a scripted fake session. Click to try real Claude (no credentials found yet).'}
            aria-label={`Mode: ${live ? 'live' : 'rehearsal'}. Click to switch.`}
          >
            {live ? <Radio size={14} className="text-accent" /> : <Theater size={14} className="text-dim" />}
            <span className="text-xs uppercase tracking-wider max-lg:hidden">{live ? 'live' : 'rehearsal'}</span>
          </button>

          <Menu
            label="Layout"
            align="end"
            trigger={({ open, toggle }) => (
              <button className={`icon-btn ${arranging ? 'is-on' : ''}`} aria-label="Layout" title="Layout" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
                <LayoutGrid size={16} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Layout</MenuLabel>
                {Object.entries(allLayouts(ui)).map(([key, l]) => (
                  <MenuItem key={key} checked={key === layoutKey} onSelect={() => (switchLayout(key), close())}>
                    {l.label}
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem icon={<MoveDiagonal size={14} />} hint="Drag panel headers to move them, drag a corner to resize." onSelect={() => (setArranging(!arranging), close())}>
                  {arranging ? 'Stop arranging' : 'Arrange panels'}
                </MenuItem>
              </>
            )}
          </Menu>

          <SoundControl />

          <button className="icon-btn" aria-label={settingsLabel} title={settingsLabel} aria-expanded={settingsOpen} onClick={() => openSettings(!settingsOpen)}>
            <SlidersHorizontal size={16} />
          </button>
        </div>

        <span className="flex items-center" title={`backend: ${conn === 'open' ? (busy ? 'working' : 'ready') : conn}`}>
          <span className={`inline-block size-2 rounded-full ${conn === 'open' ? 'bg-good' : conn === 'connecting' ? 'animate-pulse bg-warn' : 'bg-bad'}`} />
          <span className="sr-only">{conn}</span>
        </span>
      </div>

      <div className="onair" data-on={busy} aria-hidden />
    </header>
  );
}

/** Small helper used elsewhere: the dropdown arrow that sits on "pill" buttons. */
export const Caret = () => <ChevronDown size={12} className="shrink-0 opacity-60" aria-hidden />;
