import type { DomainChannel, DomainChat } from '@chatic/data';

/** A possibly-string or numeric time as epoch ms; 0 when absent or unreadable. */
const toTime = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

/**
 * When a channel last moved: its last message's time, the very time its row prints, so the order
 * and the times on screen cannot disagree. A channel with nothing cached falls back to its record's
 * `updatedAt`. A just-sent message carries `createdAt = now`, so sending floats the channel at once.
 */
export const activityAt = (channel: DomainChannel, lastChat: DomainChat | undefined): number =>
    toTime(lastChat?.createdAtMs ?? lastChat?.createdAt) || toTime(channel.updatedAt);

/** The Channels and DM lists' order: most recent activity first, ties left as given. */
export const sortByRecency = (
    channels: DomainChannel[],
    lastByChannel: ReadonlyMap<string, DomainChat>
): DomainChannel[] =>
    [...channels].sort(
        (left, right) => activityAt(right, lastByChannel.get(right.id)) - activityAt(left, lastByChannel.get(left.id))
    );
