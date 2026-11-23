import { runtime } from '@chatic/runtime';

export const setBlurLastMessage = (value: boolean): void => {
    runtime.settings.set('ui.blurLastMessage', value, { lane: 'shell' });
};

export const useBlurLastMessage = () => {
    const blurLastMessage = runtime.settings.useConfigValue<boolean>('ui.blurLastMessage') ?? false;
    return { blurLastMessage, setBlurLastMessage };
};
