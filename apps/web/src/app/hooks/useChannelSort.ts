import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { normalizeChannelSort } from '../stores/preferenceParsers';
import type { ChannelSortMethod } from '../stores/preferenceKeys';

/**
 * `ui.channelSort` is `persist: 'local'`, `writableBy: ['local']` — a plain product setting the app
 * itself persists in the course of normal use, not a QA lever (see `ConfigLanePolicy.canSupply`'s
 * `surface !== 'dev'` exemption). Merges into the existing map so switching one place's sort never
 * drops another's.
 */
export const setChannelSort = (scope: string, method: ChannelSortMethod): void => {
    const current = normalizeChannelSort(config.get('ui.channelSort'));
    config.set('ui.channelSort', { ...current, [scope]: method }, { lane: 'local' });
};

export const useChannelSort = () => {
    const raw = useConfigValue<Record<string, ChannelSortMethod>>('ui.channelSort');
    return { channelSort: normalizeChannelSort(raw ?? {}), setChannelSort };
};
