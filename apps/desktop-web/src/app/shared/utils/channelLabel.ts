import type { DomainChannel } from '@chatic/data';

import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';
import { resolveDisplay } from './displayProfile';
import { dmCounterpartId, isDmChannel, isSelfChannel } from './dmDisplay';

export type ChannelKind = 'channel' | 'dm' | 'self';

export const channelKind = (channel: DomainChannel): ChannelKind =>
    isSelfChannel(channel) ? 'self' : isDmChannel(channel) ? 'dm' : 'channel';

/**
 * A channel name without leading `#`. Every surface adds its own, so a name
 * typed with one ("#1") used to print as "##1".
 */
export const bareChannelName = (name?: string): string => (name ?? '').replace(/^#+/, '').trim();

export interface ChannelLabelContext {
    myUid: string | null;
    /** Cached user names by id (useAuthorNames). */
    names: ReadonlyMap<string, string>;
    /** Place Profile overrides by user id; a nick here wins over the global name. */
    placeProfiles: Record<string, PlaceProfileEntry>;
    /** What the self channel is called ("You"). */
    selfLabel: string;
}

/**
 * The one name a channel goes by, on every surface. A channel is its name
 * without `#`, a DM is the other person, the self channel is `selfLabel`.
 *
 * The sidebar used to be the only surface that resolved a DM to its person,
 * so the quick switcher, search, the return bar and the composer showed the
 * server's name for the room: an id, or `#self`.
 */
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

/** The label as a sentence refers to it: `#general` for a channel, the name alone for a person. */
export const channelRef = (kind: ChannelKind, label: string): string => (kind === 'channel' ? `#${label}` : label);

/**
 * The name the server gives a cloud it could not finish setting up
 * (`#cloud/1001494/3`). It is an address, not a name anyone chose.
 */
const GENERATED_CLOUD_NAME = /^#cloud\/\d+\/\d+$/;

/** A cloud's rail label: its name, or `untitled` when it has none a person gave it. */
export const cloudLabel = (cloud: { id: string; name?: string }, untitled: string): string => {
    const name = cloud.name?.trim();
    return name && !GENERATED_CLOUD_NAME.test(name) ? name : untitled;
};
