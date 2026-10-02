// ============================================================================
//  review.ts: what you decided about each of Claude's edits.
//    kept      you looked and it stays
//    reverted  you undid it (the file on disk was put back)
//  No decision yet = "pending". Remembered in this browser (localStorage), keyed by
//  the edit's id, so the answer is still there after a reload.
// ============================================================================
import { create } from 'zustand';

export type Decision = 'kept' | 'reverted';

const KEY = 'indulgent.review';

function load(): Record<string, Decision> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

interface ReviewStore {
  decisions: Record<string, Decision>;
  decide: (editId: string, decision: Decision) => void;
}

export const useReview = create<ReviewStore>((set, get) => ({
  decisions: load(),
  decide(editId, decision) {
    const decisions = { ...get().decisions, [editId]: decision };
    set({ decisions });
    try {
      localStorage.setItem(KEY, JSON.stringify(decisions));
    } catch {
      /* private mode or full: the decision still works for this visit */
    }
  },
}));
