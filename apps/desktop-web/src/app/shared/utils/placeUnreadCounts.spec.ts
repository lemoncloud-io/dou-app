import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import type { MentionItem } from '../stores/useMentionsStore';
import type { ChannelNotifyPrefs } from '../stores/useNotificationPrefsStore';
import { roomPlaces } from './roomPlaces';
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
        filedPlaces: roomPlaces(channels, { placeIds }),
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

    // The peer is in place-b and place-c too; the room lives in the place it was opened in.
    it('counts an unread 1:1 under its own place only', () => {
        const channels = [
            group('gb', 'place-b', [ME, 'peer']),
            group('gc', 'place-c', [ME, 'peer']),
            dm('place-a@me@peer', 'peer', 'place-a', unread3),
        ];

        const { byPlace, total } = counts(channels);

        expect(byPlace).toEqual({ 'place-a': 3 });
        expect(total).toBe(3);
    });

    it('counts the 1:1s with one person in two places each under its own place', () => {
        const unread1 = { ...unread3, chatNo: 1 };
        const channels = [
            dm('place-a@me@peer', 'peer', 'place-a', unread3),
            dm('place-b@me@peer', 'peer', 'place-b', unread1),
        ];

        expect(counts(channels)).toEqual({ byPlace: { 'place-a': 3, 'place-b': 1 }, total: 4 });
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

    // A 1:1 has no "mentions only": the server sends every message of it, so it counts as all.
    it('counts a 1:1 that was left on mentions only', () => {
        const mentionOnly = { ...unread3, $join: { ...unread3.$join, notify: 'mention' } };

        expect(counts([dm('dm-1', 'peer', 'place-a', mentionOnly)])).toEqual({ byPlace: { 'place-a': 3 }, total: 3 });
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

    it('keeps a muted 1:1 off its place and out of the total', () => {
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

    // A cloud with no place lists its 1:1s anyway, so a room that names none still counts somewhere.
    it('counts a 1:1 that names no place in the total only, where a cloud with no place lists it', () => {
        const channels = [dm('me@peer', 'peer', '', unread3)];
        const listed = placeUnreadCounts(channels, {
            myUid: ME,
            filedPlaces: new Map(),
            readCursors: {},
            notifyPrefs: NO_PREFS,
            listsUnplacedDms: true,
        });

        expect(listed).toEqual({ byPlace: {}, total: 3 });
    });

    // In a cloud with places no sidebar list holds it, so nothing could clear the count.
    it('leaves a 1:1 that names no place out entirely in a cloud with places', () => {
        expect(counts([dm('me@peer', 'peer', '', unread3)])).toEqual({ byPlace: {}, total: 0 });
    });

    it('counts a 1:1 under its own place before my places are known', () => {
        expect(counts([dm('dm-1', 'peer', 'place-a', unread3)], [])).toEqual({ byPlace: { 'place-a': 3 }, total: 3 });
    });
});

describe('placeUnreadCounts mentions-only channels', () => {
    // One message past the boundary, from someone else.
    const unread1 = { chatNo: 1, metaNo: 0, $join: { chatNo: 0, metaNo: 0 }, lastChat$: { ownerId: 'other' } };
    const mentionMode = { $join: { chatNo: 0, metaNo: 0, notify: 'mention' } };

    const mention = (id: string, channelId: string, placeId: string, chatNo: number): MentionItem => ({
        id,
        channelId,
        placeId,
        chatNo,
        content: '@me hi',
        ownerName: 'Ada',
        createdAt: chatNo,
    });

    const countsWith = (channels: DomainChannel[], mentions: MentionItem[], readCursors: Record<string, number> = {}) =>
        placeUnreadCounts(channels, {
            myUid: ME,
            filedPlaces: roomPlaces(channels, { placeIds: PLACES }),
            readCursors,
            notifyPrefs: NO_PREFS,
            mentions: Object.fromEntries(mentions.map(entry => [entry.id, entry])),
        });

    it('adds one unread mention of a mentions-only channel to its place and the total', () => {
        const channels = [group('g', 'place-a', [ME], { ...unread1, ...mentionMode })];

        expect(countsWith(channels, [mention('g:1', 'g', 'place-a', 1)])).toEqual({
            byPlace: { 'place-a': 1 },
            total: 1,
        });
    });

    // The inbox also holds 1:1 messages, replies and reactions; a mentions-only channel counts mentions only.
    it('adds nothing for an inbox item that is not a mention', () => {
        const channels = [group('g', 'place-a', [ME], { ...unread1, ...mentionMode })];
        const others = (['dm', 'reply', 'reaction'] as const).map(kind => ({
            ...mention(`g:${kind}`, 'g', 'place-a', 1),
            kind,
        }));

        expect(countsWith(channels, others)).toEqual({ byPlace: {}, total: 0 });
    });

    it('caps the addition at the channel unread', () => {
        const channels = [group('g', 'place-a', [ME], { ...unread1, ...mentionMode })];
        const mentions = [
            mention('g:1', 'g', 'place-a', 1),
            mention('g:2', 'g', 'place-a', 2),
            mention('g:3', 'g', 'place-a', 3),
        ];

        // Channel unread here is 1 (head 1), so three inbox entries still add one.
        expect(countsWith(channels, mentions)).toEqual({ byPlace: { 'place-a': 1 }, total: 1 });
    });

    it('adds nothing when the channel unread is back to zero', () => {
        const channels = [group('g', 'place-a', [ME], { ...unread1, ...mentionMode })];

        expect(countsWith(channels, [mention('g:1', 'g', 'place-a', 1)], { g: 1 })).toEqual({
            byPlace: {},
            total: 0,
        });
    });

    it('adds nothing for an off channel even with an unread mention', () => {
        const channels = [group('g', 'place-a', [ME], { ...unread1, $join: { chatNo: 0, metaNo: 0, notify: 'none' } })];

        expect(countsWith(channels, [mention('g:1', 'g', 'place-a', 1)])).toEqual({ byPlace: {}, total: 0 });
    });

    it('leaves out another place’s channel of the same id', () => {
        const channels = [group('g', 'place-a', [ME], { ...unread1, ...mentionMode })];

        expect(countsWith(channels, [mention('g:1', 'g', 'place-b', 1)])).toEqual({ byPlace: {}, total: 0 });
    });

    it('drops the addition once the channel is read', () => {
        const channels = [group('g', 'place-a', [ME], { ...unread1, ...mentionMode })];
        const mentions = [mention('g:1', 'g', 'place-a', 1)];

        expect(countsWith(channels, mentions)).toEqual({ byPlace: { 'place-a': 1 }, total: 1 });
        expect(countsWith(channels, mentions, { g: 5 })).toEqual({ byPlace: {}, total: 0 });
    });
});
