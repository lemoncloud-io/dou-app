import { create } from 'zustand';

interface BottomNavSuppressionState {
    suppressed: boolean;
    setSuppressed: (suppressed: boolean) => void;
}

/**
 * A tab screen's way to take the bottom nav away for a moment — the notifications tab while
 * selecting, whose action bar takes the nav's place. The layout that draws the nav reads it; the
 * screen sets it and clears it again when the moment ends or the screen goes.
 */
export const useBottomNavSuppression = create<BottomNavSuppressionState>(set => ({
    suppressed: false,
    setSuppressed: suppressed => set({ suppressed }),
}));
