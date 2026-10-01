// Small, temporary UI state that is NOT saved (which dialogs are open, etc.).
import { create } from 'zustand';

interface UIState {
  pickerOpen: boolean;
  openPicker: (open: boolean) => void;
  /** The file you clicked on the map/graph (other panels follow it). */
  selectedFile: string | null;
  selectFile: (path: string | null) => void;
}

export const useUI = create<UIState>((set) => ({
  pickerOpen: false,
  openPicker: (pickerOpen) => set({ pickerOpen }),
  selectedFile: null,
  selectFile: (selectedFile) => set({ selectedFile }),
}));
