// The app shell: top bar, setlist sidebar, panel grid, and the popups.
import { useEffect, useMemo } from 'react';
import { MotionConfig } from 'framer-motion';
import { DishToasts } from './components/DishToasts';
import { HudBar } from './components/HudBar';
import { PermissionDialog } from './components/PermissionDialog';
import { ProjectPicker } from './components/ProjectPicker';
import { Setlist } from './components/Setlist';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { Workspace } from './components/Workspace';
import { connect, useApp } from './state/store';
import { isFeatureOn, useSettings } from './state/settings';
import { applyTheme, resolveColorCode, resolveTheme } from './theme/applyTheme';

export default function App() {
  const ui = useSettings((s) => s.ui);
  const conn = useApp((s) => s.conn);

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

  return (
    <MotionConfig reducedMotion={ui.calm ? 'always' : 'user'}>
      <div className="flex h-full flex-col">
        <TopBar />
        {isFeatureOn(ui, 'hud') && <HudBar />}
        {conn === 'closed' && (
          <div className="bg-bad/15 px-3 py-1 text-center text-sm text-bad">Can't reach the backend. Is `npm start` still running? Retrying…</div>
        )}
        <div className="flex min-h-0 flex-1 gap-0 p-0">
          {ui.sidebarOpen && (
            <div className="shrink-0 py-[var(--grid-gap)] pl-[var(--grid-gap)]">
              <Setlist />
            </div>
          )}
          <Workspace />
        </div>
      </div>
      <PermissionDialog />
      <ProjectPicker />
      <Toasts />
      <DishToasts />
    </MotionConfig>
  );
}
