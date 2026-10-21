import { create } from 'zustand';

interface DmNameWaitState {
    /** Places whose 1:1 names have settled once: every name arrived, or the wait gave up. */
    settled: Record<string, true>;
    /** Places where the wait gave up on a name that never arrived, until every name has arrived. */
    gaveUp: Record<string, true>;
    /** Records how a place's wait ended: every name arrived (`gaveUp` false) or the wait gave up. */
    settle: (scope: string, gaveUp: boolean) => void;
}

/**
 * How far each place's wait for its people's names has got. Kept outside the lists so a list that
 * unmounts — the DM destination does every time another one opens — does not wait all over again
 * for a person who never resolves. In memory only: a reload asks the server again.
 */
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
