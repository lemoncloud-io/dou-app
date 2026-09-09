import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

/**
 * `persist: 'shell'`, so writes use the `shell` lane — `local` would land below a native-hydrated
 * shell value in `ConfigLanePolicy`'s row order and be silently shadowed.
 */
export const setBlurLastMessage = (value: boolean): void => {
    config.set('ui.blurLastMessage', value, { lane: 'shell' });
};

export const useBlurLastMessage = () => {
    const blurLastMessage = useConfigValue<boolean>('ui.blurLastMessage') ?? false;
    return { blurLastMessage, setBlurLastMessage };
};
