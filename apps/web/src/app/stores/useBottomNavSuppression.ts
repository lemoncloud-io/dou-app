import { create } from 'zustand';

interface BottomNavSuppressionState {
    suppressed: boolean;
    setSuppressed: (suppressed: boolean) => void;
}

export const useBottomNavSuppression = create<BottomNavSuppressionState>(set => ({
    suppressed: false,
    setSuppressed: suppressed => set({ suppressed }),
}));
