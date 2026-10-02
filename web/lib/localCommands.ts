// ============================================================================
//  localCommands.ts: the "/" commands this app handles itself (as opposed to
//  Claude Code's own commands, which are sent to Claude as a message).
//  Add one by adding an entry to LOCAL_COMMANDS.
// ============================================================================
import { send, useApp } from '../state/store';
import { useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { openInDock, showPanel } from '../settings/layouts';

export interface LocalCommand {
  name: string;
  description: string;
  run: () => void;
}

const permission = (mode: 'default' | 'acceptEdits' | 'plan') => () => send({ t: 'set_permission_mode', mode });

export const LOCAL_COMMANDS: LocalCommand[] = [
  { name: 'new', description: 'Start a fresh take (a new conversation)', run: () => send({ t: 'new_session' }) },
  { name: 'model', description: 'Choose the model for your next message', run: () => useUI.getState().openComposerMenu('model') },
  { name: 'effort', description: 'Choose how hard Claude works', run: () => useUI.getState().openComposerMenu('effort') },
  { name: 'plan', description: 'Plan only: Claude describes changes but makes none', run: permission('plan') },
  { name: 'edit', description: 'Let Claude edit files without asking each time', run: permission('acceptEdits') },
  { name: 'ask', description: 'Ask before every change (the default)', run: permission('default') },
  { name: 'terminal', description: 'Open the terminal', run: () => openInDock('terminal') },
  { name: 'map', description: 'Show the project map', run: () => showPanel('map') },
  { name: 'graph', description: 'Show the dependency graph', run: () => showPanel('graph') },
  { name: 'diff', description: 'Show what Claude changed', run: () => showPanel('diff') },
  { name: 'settings', description: 'Open the settings drawer', run: () => useUI.getState().openSettings(true) },
  { name: 'calm', description: 'Toggle calm mode (no flashing or glitching)', run: () => useSettings.getState().update({ calm: !useSettings.getState().ui.calm }) },
  { name: 'rehearsal', description: 'Switch to the scripted practice session', run: () => !useApp.getState().server?.busy && send({ t: 'set_mode', mode: 'rehearsal' }) },
  { name: 'live', description: 'Switch to real Claude Code', run: () => !useApp.getState().server?.busy && send({ t: 'set_mode', mode: 'live' }) },
];
