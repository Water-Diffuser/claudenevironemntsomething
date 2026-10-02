// The app shell: one top bar, the tiled workspace, the dock along the bottom,
// a slide-over for your sessions, and the popups.
import { useEffect, useMemo } from 'react';
import { MotionConfig } from 'framer-motion';
import { Dock } from './components/Dock';
import { DishToasts } from './components/DishToasts';
import { PermissionDialog } from './components/PermissionDialog';
import { ProjectPicker } from './components/ProjectPicker';
import { Setlist } from './components/Setlist';
import { SettingsDrawer } from './settings/SettingsDrawer';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { Workspace } from './components/Workspace';
import { connect, useApp } from './state/store';
import { useSettings } from './state/settings';
import { useUI } from './state/ui';
import { applyTheme, resolveColorCode, resolveTheme } from './theme/applyTheme';

export default function App() {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const conn = useApp((s) => s.conn);
  const arranging = useUI((s) => s.arranging);

  // Start up: load saved settings, open the WebSocket.
  useEffect(() => {
    void useSettings.getState().load();
    connect();
  }, []);

  // Whenever the theme (or color code, or calm mode) changes, repaint the CSS variables.
  const theme = useMemo(() => resolveTheme(ui.theme), [ui.theme]);
  useEffect(() => {
    applyTheme(theme, resolveColorCode(theme, ui.colorCode), ui.calm);
  }, [theme, ui.colorCode, ui.calm]);

  // Esc leaves "arrange" mode and closes the sessions slide-over.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (useUI.getState().arranging) useUI.getState().setArranging(false);
      else if (useSettings.getState().ui.sidebarOpen) useSettings.getState().update({ sidebarOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <MotionConfig reducedMotion={ui.calm ? 'always' : 'user'}>
      <div className="flex h-full flex-col">
        <TopBar />
        {conn === 'closed' && <div className="bg-bad/15 px-3 py-1 text-center text-xs text-bad">Can't reach the backend. Is `npm start` still running? Retrying…</div>}
        <div className="flex min-h-0 flex-1">
          <main className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${arranging ? 'arranging' : ''}`}>
            <Workspace />
            <Dock />
            {ui.sidebarOpen && (
              <>
                <div className="absolute inset-0 z-30 bg-shade/50" onClick={() => update({ sidebarOpen: false })} aria-hidden />
                <div className="absolute inset-y-0 left-0 z-40">
                  <Setlist />
                </div>
              </>
            )}
          </main>
          <SettingsDrawer />
        </div>
      </div>
      <PermissionDialog />
      <ProjectPicker />
      <Toasts />
      <DishToasts />
    </MotionConfig>
  );
}
