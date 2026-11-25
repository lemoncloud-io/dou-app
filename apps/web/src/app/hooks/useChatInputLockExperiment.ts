import { runtime } from '@chatic/runtime-react';

export const setChatInputLockExperiment = (value: boolean): void => {
    runtime.settings.set('feature.chatInputLock', value, { lane: 'local' });
};

export const useChatInputLockExperiment = () => {
    const isEnabled = runtime.settings.useConfigValue<boolean>('feature.chatInputLock') === true;
    return { isEnabled, setEnabled: setChatInputLockExperiment };
};
