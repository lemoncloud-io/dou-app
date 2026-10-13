import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import type { ChannelNotifyPrefs } from '../stores/useNotificationPrefsStore';
import { cloudDmPlaces } from './cloudDmPlaces';
import { placeUnreadCounts } from './placeUnreadCounts';

const ME = 'me';
const PLACES = ['place-a', 'place-b', 'place-c'];

// Three messages past my read boundary, the latest from someone else.
const unread3 = { chatNo: 3, metaNo: 0, $join: { chatNo: 0, metaNo: 0 }, lastChat$: { ownerId: 'other' } };

const group = (id: string, sid: string, memberIds: string[], fields = {}): DomainChannel =>
    ({ id, name: id, cid: 'cloud-1', sid, stereo: 'private', memberIds, ...fields }) as unknown as DomainChannel;

const NO_PREFS: ChannelNotifyPrefs = { channelNotify: {}, mutedChannels: {} };

const counts = (channels: DomainChannel[], placeIds: string[] = PLACES, notifyPrefs = NO_PREFS) =>
    placeUnreadCounts(channels, {
        myUid: ME,
        dmPlaces: cloudDmPlaces(channels, { myUid: ME, placeIds }),
        readCursors: {},
        notifyPrefs,
    });

const dm = (id: string, peerId: string, sid: string, fields = {}): DomainChannel =>
    ({ id, cid: 'cloud-1', sid, stereo: 'dm', memberIds: [ME, peerId], ...fields }) as unknown as DomainChannel;

describe('placeUnreadCounts', () => {
    it('counts a group channel under its own place', () => {
        const { byPlace, total } = counts([group('g', 'place-a', [ME], unread3)]);

        expect(byPlace).toEqual({ 'place-a': 3 });
        expect(total).toBe(3);
    });

    // The peer is in place-b and place-c, not in the place the room is stamped with.
    it('puts an unread 1:1 on every place that lists it, and counts it once in the total', () => {
        const channels = [
            group('gb', 'place-b', [ME, 'peer']),
            group('gc', 'place-c', [ME, 'peer']),
            dm('dm-1', 'peer', 'place-a', unread3),
        ];

        const { byPlace, total } = counts(channels);

        expect(byPlace).toEqual({ 'place-b': 3, 'place-c': 3 });
        expect(total).toBe(3);
    });

    it('leaves read channels out of the map', () => {
        const { byPlace, total } = counts([group('g', 'place-a', [ME])]);

        expect(byPlace).toEqual({});
        expect(total).toBe(0);
    });

    it('leaves out a group channel that names no place', () => {
        expect(counts([group('g', '', [ME], unread3)])).toEqual({ byPlace: {}, total: 0 });
    });

    // The row keeps its own dot; the place tile and the cloud tile above it stay clear.
    it('keeps a muted channel off its place and out of the total', () => {
        const muted = { ...unread3, $join: { ...unread3.$join, notify: 'none' } };

        expect(counts([group('g', 'place-a', [ME], muted)])).toEqual({ byPlace: {}, total: 0 });
    });

    it('keeps a mention-only channel off its place and out of the total', () => {
        const mentionOnly = { ...unread3, $join: { ...unread3.$join, notify: 'mention' } };

        expect(counts([group('g', 'place-a', [ME], mentionOnly)])).toEqual({ byPlace: {}, total: 0 });
    });

    // A mode set on this device wins over the join row, in both directions.
    it('follows the mode set on this device over the join row', () => {
        const mutedOnServer = { ...unread3, $join: { ...unread3.$join, notify: 'none' } };
        const loudOnServer = { ...unread3, $join: { ...unread3.$join, notify: 'all' } };
        const channels = [group('quiet', 'place-a', [ME], loudOnServer), group('loud', 'place-b', [ME], mutedOnServer)];

        const { byPlace, total } = counts(channels, PLACES, {
            channelNotify: { quiet: 'none', loud: 'all' },
            mutedChannels: {},
        });

        expect(byPlace).toEqual({ 'place-b': 3 });
        expect(total).toBe(3);
    });

    // The map from before per-channel modes existed still mutes a channel that has no mode.
    it('keeps a channel muted in the legacy map off its place and out of the total', () => {
        const { byPlace, total } = counts([group('g', 'place-a', [ME], unread3)], PLACES, {
            channelNotify: {},
            mutedChannels: { g: true },
        });

        expect(byPlace).toEqual({});
        expect(total).toBe(0);
    });

    it('keeps a muted 1:1 off every place that lists it and out of the total', () => {
        const muted = { ...unread3, $join: { ...unread3.$join, notify: 'none' } };
        const channels = [
            group('gb', 'place-b', [ME, 'peer']),
            group('gc', 'place-c', [ME, 'peer']),
            dm('dm-1', 'peer', 'place-a', muted),
        ];

        expect(counts(channels)).toEqual({ byPlace: {}, total: 0 });
    });

    it('still counts an unmuted channel beside a muted one in the same place', () => {
        const muted = { ...unread3, $join: { ...unread3.$join, notify: 'none' } };

        const { byPlace, total } = counts([
            group('quiet', 'place-a', [ME], muted),
            group('loud', 'place-a', [ME], unread3),
        ]);

        expect(byPlace).toEqual({ 'place-a': 3 });
        expect(total).toBe(3);
    });

    // Before my places load a 1:1 has no place to dot, but it is still unread.
    it('counts a 1:1 in the total while my places are unknown', () => {
        expect(counts([dm('dm-1', 'peer', 'place-a', unread3)], [])).toEqual({ byPlace: {}, total: 3 });
    });
});
