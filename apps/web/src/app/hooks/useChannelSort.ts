import { runtime } from '@chatic/runtime';
import { normalizeChannelSort } from '../stores/preferenceParsers';
import type { ChannelSortMethod } from '../stores/preferenceKeys';

export const setChannelSort = (scope: string, method: ChannelSortMethod): void => {
    const current = normalizeChannelSort(runtime.settings.get('ui.channelSort'));
    runtime.settings.set('ui.channelSort', { ...current, [scope]: method }, { lane: 'local' });
};

export const useChannelSort = () => {
    const raw = runtime.settings.useConfigValue<Record<string, ChannelSortMethod>>('ui.channelSort');
    return { channelSort: normalizeChannelSort(raw ?? {}), setChannelSort };
};
