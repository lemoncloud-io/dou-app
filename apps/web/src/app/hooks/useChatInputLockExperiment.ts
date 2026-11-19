import { runtime } from '@chatic/runtime';

/** `persist: 'local'` and no shell lane, so the Lab switch writes the local lane. */
export const setChatInputLockExperiment = (value: boolean): void => {
    runtime.settings.set('feature.chatInputLock', value, { lane: 'local' });
};

/** The Lab switch behind the chat input lock. Off unless this device turned it on. */
export const useChatInputLockExperiment = () => {
    const isEnabled = runtime.settings.useConfigValue<boolean>('feature.chatInputLock') === true;
    return { isEnabled, setEnabled: setChatInputLockExperiment };
};
