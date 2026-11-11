import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainPlace } from '@chatic/data';
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
    /** A switch is in flight (or the socket is not verified yet): both rails are locked, keys too. */
    isSwitching?: boolean;
    /** Home draws one fixed tile that is not a place switch, so no number names a place there. */
    isDefaultMode?: boolean;
}

/**
 * The rail's number keys: Mod+0 goes to Home and Mod+1…Mod+9 to the clouds under it, Shift+1…Shift+9
 * to the place tiles — each in the order the rail draws them, so a number means the row the reader is
 * looking at, drags included.
 *
 * Home takes 0 rather than a row number because it is the fixed return row every cloud comes back
 * through and the one row nobody goes to on purpose, so the key outside the count is cheap there and
 * leaves 1…9 for the clouds. A place has no Home row, so its numbers start at its first tile.
 *
 * Two chords are told apart by the modifier, and Shift+digit is a character: in a text field it types
 * ("!" for 1), so a place chord never fires there. Mod+digit types nothing, so it works from the
 * composer as well. Nothing fires over a dialog or an open menu, which own the keyboard themselves.
 */
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
    // The same stored order the rails are drawn from.
    const { storedIds: cloudOrder } = useCloudOrder();
    const { storedIds: placeOrder } = usePlaceOrder(places[0]?.cid ?? null);
    const orderedClouds = useMemo(() => orderedRailClouds(clouds, cloudOrder), [clouds, cloudOrder]);
    const orderedPlaces = useMemo(() => orderedRailPlaces(places, placeOrder), [places, placeOrder]);

    // The listener is added once, so everything it reads comes through here — the same shape the
    // next-unread shortcut uses.
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
            // A held key must not walk the rail, and Alt belongs to the sidebar's own chords.
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
                // The session names no cloud while it sits on Home, so the Home row is what is open.
                const currentCloudId = live.activeCloudId ?? (live.isDefaultMode ? (home?.id ?? null) : null);
                // The reader is steering by number, so the room that opens must not take the caret:
                // the next chord would type its character into the box instead of moving.
                useComposerFocusStore.getState().requestSkip();
                event.preventDefault();
                selectRailCloud(target, currentCloudId, live.onSelectCloud, live.t);
                return;
            }

            // Shift+digit is the character it types, so a field being typed in keeps it.
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
