import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../storage';

export interface JoinedCloud {
    id: string;
    name?: string;
    ownerUid?: string;
}

interface JoinedCloudsState {
    joinedClouds: Record<string, JoinedCloud>;
    addJoinedCloud: (cloud: JoinedCloud) => void;
    removeJoinedCloud: (cloudId: string) => void;
    reconcileOwners: (accountId: string, moveFrom: string | null) => void;
}

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
            reconcileOwners: (accountId, moveFrom) =>
                set(state => ({
                    joinedClouds: Object.fromEntries(
                        Object.entries(state.joinedClouds).map(([id, joined]) => [
                            id,
                            !joined.ownerUid || (moveFrom !== null && joined.ownerUid === moveFrom)
                                ? { ...joined, ownerUid: accountId }
                                : joined,
                        ])
                    ),
                })),
        }),
        { name: 'chatic-joined-clouds', storage: persistStorageOver(deviceStore) }
    )
);
