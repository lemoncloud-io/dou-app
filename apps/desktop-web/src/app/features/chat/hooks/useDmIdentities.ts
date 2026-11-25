import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

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

export const DM_NAME_WAIT_MS = 10_000;

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

const selfIdOf = (channel: DomainChannel): string => channel.$join?.userId ?? channel.memberIds?.[0] ?? '';

export interface DmIdentity {
    label: string;
    seed: string;
    display: ResolvedDisplay;
    pending: boolean;
}

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
    const isNamed = (peerId: string): boolean =>
        !!placeProfiles[peerId]?.nick?.trim() || !!counterpartProfiles.get(peerId)?.name;
    const hasUnnamedDmPeer = dms.some(c => {
        if (!c.id) return false;
        const peerId = dmCounterpartId(c, myUid, c.$join?.userId);
        return !!peerId && !isSelfChannel(c) && !isNamed(peerId);
    });
    const { holdSection, waitForName } = useDmNameWait(hasUnnamedDmPeer, scope);

    const identityOf = (channel: DomainChannel): DmIdentity => {
        if (isSelfChannel(channel)) {
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

    const memberDisplay = (peerId: string): ResolvedDisplay => {
        const cloud = counterpartProfiles.get(peerId);
        return resolveDisplay(placeProfiles[peerId], cloud?.name ?? '', cloud?.thumbnail);
    };

    return { identityOf, memberDisplay, holdSection };
};
