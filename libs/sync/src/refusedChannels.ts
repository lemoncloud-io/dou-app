import { logger } from '@chatic/logger';

const refused = new Set<string>();

type Listener = () => void;
const listeners = new Set<Listener>();

const notify = (): void => {
    listed = null;
    listeners.forEach(listener => listener());
};

export const recordRefusedChannel = (channelId: string): void => {
    if (refused.has(channelId)) return;
    refused.add(channelId);
    logger.info('SYNC', '[refusedChannels] the server refused this channel — the room can say so', {
        data: { channelId },
    });
    notify();
};

export const clearRefusedChannel = (channelId: string): void => {
    if (!refused.delete(channelId)) return;
    notify();
};

export const clearRefusedChannels = (): void => {
    if (refused.size === 0) return;
    refused.clear();
    notify();
};

export const isChannelRefused = (channelId: string): boolean => refused.has(channelId);

let listed: string[] | null = null;

export const listRefusedChannels = (): string[] => {
    listed ??= [...refused];
    return listed;
};

export const subscribeRefusedChannels = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
