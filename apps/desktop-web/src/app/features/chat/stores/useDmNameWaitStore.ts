import { create } from 'zustand';

interface DmNameWaitState {
    settled: Record<string, true>;
    gaveUp: Record<string, true>;
    settle: (scope: string, gaveUp: boolean) => void;
}

export const useDmNameWaitStore = create<DmNameWaitState>()(set => ({
    settled: {},
    gaveUp: {},
    settle: (scope, gaveUp) =>
        set(state => {
            if (state.settled[scope] && !!state.gaveUp[scope] === gaveUp) return state;
            const { [scope]: _cleared, ...rest } = state.gaveUp;
            return {
                settled: { ...state.settled, [scope]: true },
                gaveUp: gaveUp ? { ...state.gaveUp, [scope]: true } : rest,
            };
        }),
}));
