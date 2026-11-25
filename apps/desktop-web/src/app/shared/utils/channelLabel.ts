import type { DomainChannel } from '@chatic/runtime-react';

import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';
import { resolveDisplay } from './displayProfile';
import { dmCounterpartId, isDmChannel, isSelfChannel } from './dmDisplay';

export type ChannelKind = 'channel' | 'dm' | 'self';

export const channelKind = (channel: DomainChannel): ChannelKind =>
    isSelfChannel(channel) ? 'self' : isDmChannel(channel) ? 'dm' : 'channel';

export const bareChannelName = (name?: string): string => (name ?? '').replace(/^#+/, '').trim();

export interface ChannelLabelContext {
    myUid: string | null;
    names: ReadonlyMap<string, string>;
    placeProfiles: Record<string, PlaceProfileEntry>;
    selfLabel: string;
}

export const channelLabel = (channel: DomainChannel, context: ChannelLabelContext): string => {
    const kind = channelKind(channel);
    if (kind === 'self') return context.selfLabel;
    if (kind === 'dm') {
        const counterpartId = dmCounterpartId(channel, context.myUid, channel.$join?.userId);
        const fallback =
            (counterpartId && context.names.get(counterpartId)) ||
            bareChannelName(channel.name) ||
            counterpartId ||
            channel.id ||
            '';
        return resolveDisplay(counterpartId ? context.placeProfiles[counterpartId] : undefined, fallback, undefined)
            .name;
    }
    return bareChannelName(channel.name) || channel.id || '';
};

export const channelRef = (kind: ChannelKind, label: string): string => (kind === 'channel' ? `#${label}` : label);

const GENERATED_CLOUD_NAME = /^#cloud\/\d+\/\d+$/;

export const cloudLabel = (cloud: { id: string; name?: string }, untitled: string): string => {
    const name = cloud.name?.trim();
    return name && !GENERATED_CLOUD_NAME.test(name) ? name : untitled;
};
