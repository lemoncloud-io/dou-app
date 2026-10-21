import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import {
    dmCounterpartId,
    isSelfChannel,
    resolveDisplay,
    useCloudProfiles,
    useSiteProfileMap,
    type ResolvedDisplay,
} from '../../../shared';
import { useDmNameWaitStore } from '../stores';
import { useHydrateDmPeers, type DmPeerRef } from './useHydrateDmPeers';

/**
 * How long a 1:1 list waits for its people's names. A cold cloud has none cached, and
 * `useHydrateDmPeers` has to reach the server first, which took 5-10s when this was measured.
 * Past this the rows fall back to the room name: a person whose record never arrives (a deleted
 * account) must not hold the list forever.
 */
export const DM_NAME_WAIT_MS = 10_000;

/**
 * Whether a 1:1 list is still waiting for names, per place (`scope`).
 *
 * - `holdSection` — the place's first names have not all arrived. The whole list is drawn as
 *   placeholder rows, so it is sorted once instead of re-sorting under the pointer as each name
 *   lands.
 * - `waitForName` — an unnamed row is drawn as a placeholder rather than as the raw id. After the
 *   first settle this is per row: a 1:1 that appears later waits on its own name without folding the
 *   whole list back.
 *
 * Both give up after `DM_NAME_WAIT_MS`. The wait restarts only once every name has arrived, so a
 * person who never resolves does not hold every later row too. Where the wait stands is kept per
 * place in `useDmNameWaitStore`, so it outlives a list that unmounts.
 */
const useDmNameWait = (hasUnnamedPeer: boolean, scope: string) => {
    const settled = useDmNameWaitStore(state => !!state.settled[scope]);
    const gaveUp = useDmNameWaitStore(state => !!state.gaveUp[scope]);
    useEffect(() => {
        const { settle } = useDmNameWaitStore.getState();
        if (!hasUnnamedPeer) {
            settle(scope, false);
            return;
        }
        if (gaveUp) return;
        const timer = setTimeout(() => settle(scope, true), DM_NAME_WAIT_MS);
        return () => clearTimeout(timer);
    }, [hasUnnamedPeer, scope, gaveUp]);
    const waitForName = hasUnnamedPeer && !gaveUp;
    return { holdSection: waitForName && !settled, waitForName };
};

/**
 * My id in a notes-to-self room: its join row names my id in this cloud, which is what place and
 * cloud profiles are keyed by — the session id can differ from it.
 */
const selfIdOf = (channel: DomainChannel): string => channel.$join?.userId ?? channel.memberIds?.[0] ?? '';

/** Who a 1:1 row shows: its label, the person's photo and name, and the id their color is seeded from. */
export interface DmIdentity {
    label: string;
    seed: string;
    display: ResolvedDisplay;
    /** The person has no name yet: the row is drawn as a placeholder, never as the raw id. */
    pending: boolean;
}

/**
 * Names the other party of each 1:1 (and me, in my notes-to-self room): this place's profile where
 * they set one, else their cloud profile — field by field, so a place nick with no place photo keeps
 * the cloud photo. People with no 1:1 yet (`members`) are named from the same lookup. Rows this
 * place's profiles don't name are hydrated from the server, and the list waits for those names
 * (`holdSection`) rather than drawing raw ids.
 */
export const useDmIdentities = (dms: readonly DomainChannel[], members: readonly DmPeerRef[], scope: string) => {
    const { t } = useTranslation();
    const myUid = runtime.session.useSessionIdentity().userId;
    const placeProfiles = useSiteProfileMap();
    const counterpartIds = useMemo(
        () => [
            ...dms
                .map(c => (isSelfChannel(c) ? selfIdOf(c) : dmCounterpartId(c, myUid, c.$join?.userId)))
                .filter((id): id is string => !!id),
            ...members.map(member => member.peerId),
        ],
        [dms, myUid, members]
    );
    const counterpartProfiles = useCloudProfiles(counterpartIds);
    // Rows this place's profiles don't name read the user cache, which only an opened room fills.
    const unnamedPeers = useMemo(
        () =>
            dms
                .flatMap(c => {
                    const peerId = dmCounterpartId(c, myUid, c.$join?.userId);
                    return c.id && peerId && !placeProfiles[peerId]?.nick?.trim() ? [{ channelId: c.id, peerId }] : [];
                })
                .concat(members.filter(member => !placeProfiles[member.peerId]?.nick?.trim())),
        [dms, myUid, members, placeProfiles]
    );
    useHydrateDmPeers(unnamedPeers);
    // A person is named once this place's profile or their cloud profile gives a name.
    const isNamed = (peerId: string): boolean =>
        !!placeProfiles[peerId]?.nick?.trim() || !!counterpartProfiles.get(peerId)?.name;
    // Only the 1:1s' people count: a person with no 1:1 yet is left out until named anyway. A room
    // with no id draws no row, so it holds nothing — and both lists sharing the wait agree on that.
    const hasUnnamedDmPeer = dms.some(c => {
        if (!c.id) return false;
        const peerId = dmCounterpartId(c, myUid, c.$join?.userId);
        return !!peerId && !isSelfChannel(c) && !isNamed(peerId);
    });
    const { holdSection, waitForName } = useDmNameWait(hasUnnamedDmPeer, scope);

    const identityOf = (channel: DomainChannel): DmIdentity => {
        if (isSelfChannel(channel)) {
            // Drawn like the picker's "me" row: my place photo, else my cloud one. The label stays.
            const selfId = selfIdOf(channel);
            const display = resolveDisplay(
                selfId ? placeProfiles[selfId] : undefined,
                counterpartProfiles.get(selfId)?.name ?? t('dm.you'),
                counterpartProfiles.get(selfId)?.thumbnail
            );
            return { label: t('dm.you'), seed: selfId || (myUid ?? 'me'), display, pending: false };
        }
        const counterpartId = dmCounterpartId(channel, myUid, channel.$join?.userId) ?? '';
        const display = resolveDisplay(
            counterpartId ? placeProfiles[counterpartId] : undefined,
            counterpartProfiles.get(counterpartId)?.name ?? channel.name ?? counterpartId,
            counterpartProfiles.get(counterpartId)?.thumbnail
        );
        return {
            label: display.name || (channel.name ?? channel.id ?? ''),
            seed: counterpartId,
            display,
            pending: waitForName && !!counterpartId && !isNamed(counterpartId),
        };
    };

    /** A person with no 1:1 yet, as named so far: an empty or id-only name means not named yet. */
    const memberDisplay = (peerId: string): ResolvedDisplay => {
        const cloud = counterpartProfiles.get(peerId);
        return resolveDisplay(placeProfiles[peerId], cloud?.name ?? '', cloud?.thumbnail);
    };

    return { identityOf, memberDisplay, holdSection };
};
