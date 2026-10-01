// Small, temporary UI state that is NOT saved (which dialogs are open, etc.).
import { create } from 'zustand';

interface UIState {
  pickerOpen: boolean;
  openPicker: (open: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  pickerOpen: false,
  openPicker: (pickerOpen) => set({ pickerOpen }),
}));
