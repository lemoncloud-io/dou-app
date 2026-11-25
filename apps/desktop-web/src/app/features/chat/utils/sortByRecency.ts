import type { DomainChannel, DomainChat } from '@chatic/runtime-react';

const toTime = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

export const activityAt = (channel: DomainChannel, lastChat: DomainChat | undefined): number =>
    toTime(lastChat?.createdAtMs ?? lastChat?.createdAt) || toTime(channel.updatedAt);

export const sortByRecency = (
    channels: DomainChannel[],
    lastByChannel: ReadonlyMap<string, DomainChat>
): DomainChannel[] =>
    [...channels].sort(
        (left, right) => activityAt(right, lastByChannel.get(right.id)) - activityAt(left, lastByChannel.get(left.id))
    );
