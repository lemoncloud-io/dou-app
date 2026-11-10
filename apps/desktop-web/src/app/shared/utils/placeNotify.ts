import type { DomainChannel } from '@chatic/data';

import {
    channelNotifyMode,
    isNotifyDm,
    type ChannelNotifyMode,
    type ChannelNotifyPrefs,
} from '../stores/useNotificationPrefsStore';
import { isSelfChannel } from './dmDisplay';

/**
 * The key a place-level notification choice is stored under. Place ids are only unique inside a
 * cloud, so the cloud is part of the key.
 */
export const placeNotifyKey = (cloudId: string | null | undefined, placeId: string): string =>
    `${cloudId || 'default'}:${placeId}`;

/**
 * The channels a place-level choice reaches: every listed channel except my notes-to-self room,
 * which every place lists and which never notifies anyone.
 */
export const placeNotifyTargets = (channels: readonly DomainChannel[]): DomainChannel[] =>
    channels.filter(channel => !!channel.id && !isSelfChannel(channel));

/** The level a channel takes when its place is set to `mode`: a 1:1 has no "mentions only". */
export const placeModeFor = (channel: DomainChannel, mode: ChannelNotifyMode): ChannelNotifyMode =>
    mode === 'mention' && isNotifyDm(channel) ? 'all' : mode;

const effectiveMode = (prefs: ChannelNotifyPrefs, channel: DomainChannel): ChannelNotifyMode =>
    channelNotifyMode(prefs, channel.id ?? '', channel.$join?.notify, isNotifyDm(channel));

export interface PlaceNotifySummary {
    /** The place's level: the one chosen for it, else the one every channel shares, else none. */
    mode: ChannelNotifyMode | null;
    /** Channels whose level differs from `mode` (from "all" when the place has no level). */
    exceptions: number;
}

/** What the place's notification control shows. */
export const summarizePlaceNotify = (
    channels: readonly DomainChannel[],
    prefs: ChannelNotifyPrefs,
    remembered?: ChannelNotifyMode
): PlaceNotifySummary => {
    const targets = placeNotifyTargets(channels);
    const modes = targets.map(channel => effectiveMode(prefs, channel));
    const shared = modes.length > 0 && modes.every(mode => mode === modes[0]) ? modes[0] : null;
    const mode = remembered ?? shared;
    const baseline = mode ?? 'all';
    const exceptions = targets.filter((channel, i) => modes[i] !== placeModeFor(channel, baseline)).length;
    return { mode, exceptions };
};

/** One channel write a place-level choice needs. */
export interface PlaceNotifyWrite {
    channelId: string;
    /** My cloud user id in the channel (`$join.userId`), the join row the server updates. */
    userId: string;
    notify: ChannelNotifyMode;
}

/**
 * The writes that bring every target channel to `mode`. A channel already there is left out, so
 * choosing the same level again sends nothing; a channel with no known join user is left out too,
 * since the server could not tell whose row to change.
 */
export const placeNotifyWrites = (
    channels: readonly DomainChannel[],
    prefs: ChannelNotifyPrefs,
    mode: ChannelNotifyMode,
    myUid: string | null
): PlaceNotifyWrite[] =>
    placeNotifyTargets(channels).flatMap(channel => {
        const notify = placeModeFor(channel, mode);
        const userId = channel.$join?.userId ?? myUid ?? '';
        if (!userId || effectiveMode(prefs, channel) === notify) return [];
        return [{ channelId: channel.id ?? '', userId, notify }];
    });
