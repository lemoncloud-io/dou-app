import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface JoinedCloud {
    id: string;
    name?: string;
    /**
     * The account that joined it (its relay uid). The store is device-wide and survives a sign-out, so
     * the rail lists only the entries of the account signed in. An entry without one predates the field
     * and is listed for nobody until `reconcileCloudRecordOwners` gives it to the first account that
     * signs in.
     */
    ownerUid?: string;
}

interface JoinedCloudsState {
    /** cloudId → cloud joined via invite, kept until the broker list reflects it. */
    joinedClouds: Record<string, JoinedCloud>;
    addJoinedCloud: (cloud: JoinedCloud) => void;
    /** Forget an invite-joined cloud (remove it from the rail). */
    removeJoinedCloud: (cloudId: string) => void;
    /**
     * Gives every entry with no owner to `accountId`, and, when `moveFrom` is set, moves that
     * account's entries to `accountId`. Entries that have another owner are left alone.
     */
    reconcileOwners: (accountId: string, moveFrom: string | null) => void;
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
        { name: 'chatic-joined-clouds' }
    )
);
