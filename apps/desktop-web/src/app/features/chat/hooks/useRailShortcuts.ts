import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainPlace } from '@chatic/runtime';
import { useCloudOrder, usePlaceOrder } from '@chatic/shared';

import type { RailCloud } from '../../../shared';
import { useComposerFocusStore } from '../../../shared';
import {
    digitOfKey,
    isOverlayOpen,
    isTypingTarget,
    orderedRailClouds,
    orderedRailPlaces,
    selectRailCloud,
} from '../utils';

interface RailShortcutsOptions {
    clouds: readonly RailCloud[];
    places: readonly DomainPlace[];
    activeCloudId: string | null;
    onSelectCloud: (cloudId: string) => void;
    onSelectPlace: (placeId: string) => void;
    isSwitching?: boolean;
    isDefaultMode?: boolean;
}

export const useRailShortcuts = ({
    clouds,
    places,
    activeCloudId,
    onSelectCloud,
    onSelectPlace,
    isSwitching,
    isDefaultMode,
}: RailShortcutsOptions) => {
    const { t } = useTranslation();
    const { storedIds: cloudOrder } = useCloudOrder();
    const { storedIds: placeOrder } = usePlaceOrder(places[0]?.cid ?? null);
    const orderedClouds = useMemo(() => orderedRailClouds(clouds, cloudOrder), [clouds, cloudOrder]);
    const orderedPlaces = useMemo(() => orderedRailPlaces(places, placeOrder), [places, placeOrder]);

    const latest = useRef({
        orderedClouds,
        orderedPlaces,
        activeCloudId,
        onSelectCloud,
        onSelectPlace,
        isSwitching,
        isDefaultMode,
        t,
    });
    latest.current = {
        orderedClouds,
        orderedPlaces,
        activeCloudId,
        onSelectCloud,
        onSelectPlace,
        isSwitching,
        isDefaultMode,
        t,
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey) return;
            const cloudChord = (event.metaKey || event.ctrlKey) && !event.shiftKey;
            const placeChord = event.shiftKey && !event.metaKey && !event.ctrlKey;
            if (!cloudChord && !placeChord) return;
            const digit = digitOfKey(event);
            if (digit === null) return;
            const live = latest.current;
            if (live.isSwitching) return;
            if (isOverlayOpen()) return;

            if (cloudChord) {
                const home = live.orderedClouds.find(cloud => cloud.kind === 'home');
                const others = live.orderedClouds.filter(cloud => cloud.kind !== 'home');
                const target = digit === 0 ? home : others[digit - 1];
                if (!target) return;
                const currentCloudId = live.activeCloudId ?? (live.isDefaultMode ? (home?.id ?? null) : null);
                useComposerFocusStore.getState().requestSkip();
                event.preventDefault();
                selectRailCloud(target, currentCloudId, live.onSelectCloud, live.t);
                return;
            }

            if (live.isDefaultMode || isTypingTarget(event.target)) return;
            const target = digit === 0 ? undefined : live.orderedPlaces[digit - 1];
            if (!target) return;
            useComposerFocusStore.getState().requestSkip();
            event.preventDefault();
            live.onSelectPlace(target.id);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
};
