import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface JoinedCloud {
    id: string;
    name?: string;
}

interface JoinedCloudsState {
    /** cloudId → cloud joined via invite, kept until the broker list reflects it. */
    joinedClouds: Record<string, JoinedCloud>;
    addJoinedCloud: (cloud: JoinedCloud) => void;
    /** Forget an invite-joined cloud (remove it from the rail). */
    removeJoinedCloud: (cloudId: string) => void;
}

/**
 * Clouds joined via an Invite Code, remembered locally. The broker cloud list
 * (`/clouds/0/list`) is eventually consistent and may not return a just-joined
 * cloud for a while, so the rail merges these in (deduped) to show it
 * immediately. Persisted so it survives relaunch until the broker catches up.
 */
export const useJoinedCloudsStore = create<JoinedCloudsState>()(
    persist(
        set => ({
            joinedClouds: {},
            addJoinedCloud: cloud => set(state => ({ joinedClouds: { ...state.joinedClouds, [cloud.id]: cloud } })),
            removeJoinedCloud: cloudId =>
                set(state => {
                    const { [cloudId]: _removed, ...rest } = state.joinedClouds;
                    return { joinedClouds: rest };
                }),
        }),
        { name: 'chatic-joined-clouds' }
    )
);
