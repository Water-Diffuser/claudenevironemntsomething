// Small, temporary UI state that is NOT saved (which dialogs are open, etc.).
import { create } from 'zustand';
import type { SymRef } from '../lib/codeGraph';

export type ComposerMenu = 'model' | 'effort' | 'permission';

interface UIState {
  /** Which picker next to the message box is open (a "/model" command opens it from the keyboard). */
  composerMenu: ComposerMenu | null;
  openComposerMenu: (menu: ComposerMenu | null) => void;
  /** "Arrange" mode: panels can be dragged and resized. Off normally, so nothing moves by accident. */
  arranging: boolean;
  setArranging: (on: boolean) => void;
  /** Is the settings drawer (theme editor etc.) open? */
  settingsOpen: boolean;
  openSettings: (open: boolean) => void;
  pickerOpen: boolean;
  openPicker: (open: boolean) => void;
  /** Counts up on every pick, so the editor reacts even when you click the same file twice. */
  selectTick: number;
  /** The file you clicked on the map/graph (other panels follow it). */
  selectedFile: string | null;
  selectFile: (path: string | null) => void;
  /** A function/class you clicked in the graph (null = just the file). */
  selectedSymbol: SymRef | null;
  selectSymbol: (sym: SymRef | null) => void;
  /** "Go to this line" requests (from clicking a stack frame). The code view listens. */
  jumpTo: { path: string; line: number; ts: number } | null;
  jump: (path: string, line: number) => void;
  /** Files to flash on the map and graph right now (from clicking a stack frame). */
  uiFlash: { paths: string[]; ts: number } | null;
  flash: (paths: string[]) => void;
  /** What the impact view is about. null = follow Claude's latest edit. */
  impactTarget: { path: string; symbolIds: string[] } | null;
  setImpactTarget: (t: { path: string; symbolIds: string[] } | null) => void;
}

export const useUI = create<UIState>((set) => ({
  composerMenu: null,
  openComposerMenu: (composerMenu) => set({ composerMenu }),
  arranging: false,
  setArranging: (arranging) => set({ arranging }),
  settingsOpen: false,
  openSettings: (settingsOpen) => set({ settingsOpen }),
  pickerOpen: false,
  openPicker: (pickerOpen) => set({ pickerOpen }),
  selectTick: 0,
  selectedFile: null,
  // picking a file clears any function pick, unless the same call also sets one
  selectFile: (selectedFile) => set((s) => ({ selectedFile, selectTick: s.selectTick + 1, selectedSymbol: selectedFile === s.selectedFile ? s.selectedSymbol : null })),
  selectedSymbol: null,
  selectSymbol: (selectedSymbol) => set((s) => ({ selectedSymbol, selectTick: s.selectTick + 1, selectedFile: selectedSymbol ? selectedSymbol.path : null })),
  jumpTo: null,
  jump: (path, line) => set((s) => ({ jumpTo: { path, line, ts: Date.now() }, selectTick: s.selectTick + 1, selectedFile: path })),
  uiFlash: null,
  flash: (paths) => set({ uiFlash: { paths, ts: Date.now() } }),
  impactTarget: null,
  setImpactTarget: (impactTarget) => set({ impactTarget }),
}));
