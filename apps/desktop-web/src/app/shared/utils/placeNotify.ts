import type { DomainChannel } from '@chatic/runtime';

import {
    channelNotifyMode,
    isNotifyDm,
    type ChannelNotifyMode,
    type ChannelNotifyPrefs,
} from '../stores/useNotificationPrefsStore';
import { isSelfChannel } from './dmDisplay';

export const placeNotifyKey = (cloudId: string | null | undefined, placeId: string): string =>
    `${cloudId || 'default'}:${placeId}`;

export const placeNotifyTargets = (channels: readonly DomainChannel[]): DomainChannel[] =>
    channels.filter(channel => !!channel.id && !!channel.$join?.userId && !isSelfChannel(channel));

export const placeModeFor = (channel: DomainChannel, mode: ChannelNotifyMode): ChannelNotifyMode =>
    mode === 'mention' && isNotifyDm(channel) ? 'all' : mode;

const effectiveMode = (prefs: ChannelNotifyPrefs, channel: DomainChannel): ChannelNotifyMode =>
    channelNotifyMode(prefs, channel.id ?? '', channel.$join?.notify, isNotifyDm(channel));

export interface PlaceNotifySummary {
    mode: ChannelNotifyMode | null;
    exceptions: number;
}

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

export interface PlaceNotifyWrite {
    channelId: string;
    userId: string;
    notify: ChannelNotifyMode;
}

export const placeNotifyWrites = (
    channels: readonly DomainChannel[],
    prefs: ChannelNotifyPrefs,
    mode: ChannelNotifyMode
): PlaceNotifyWrite[] =>
    placeNotifyTargets(channels).flatMap(channel => {
        const notify = placeModeFor(channel, mode);
        if (effectiveMode(prefs, channel) === notify) return [];
        return [{ channelId: channel.id ?? '', userId: channel.$join?.userId ?? '', notify }];
    });
