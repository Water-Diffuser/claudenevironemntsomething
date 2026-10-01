// Small, temporary UI state that is NOT saved (which dialogs are open, etc.).
import { create } from 'zustand';
import type { SymRef } from '../lib/codeGraph';

interface UIState {
  pickerOpen: boolean;
  openPicker: (open: boolean) => void;
  /** The file you clicked on the map/graph (other panels follow it). */
  selectedFile: string | null;
  selectFile: (path: string | null) => void;
  /** A function/class you clicked in the graph (null = just the file). */
  selectedSymbol: SymRef | null;
  selectSymbol: (sym: SymRef | null) => void;
  /** What the impact view is about. null = follow Claude's latest edit. */
  impactTarget: { path: string; symbolIds: string[] } | null;
  setImpactTarget: (t: { path: string; symbolIds: string[] } | null) => void;
}

export const useUI = create<UIState>((set) => ({
  pickerOpen: false,
  openPicker: (pickerOpen) => set({ pickerOpen }),
  selectedFile: null,
  // picking a file clears any function pick, unless the same call also sets one
  selectFile: (selectedFile) => set((s) => ({ selectedFile, selectedSymbol: selectedFile === s.selectedFile ? s.selectedSymbol : null })),
  selectedSymbol: null,
  selectSymbol: (selectedSymbol) => set({ selectedSymbol, selectedFile: selectedSymbol ? selectedSymbol.path : null }),
  impactTarget: null,
  setImpactTarget: (impactTarget) => set({ impactTarget }),
}));
