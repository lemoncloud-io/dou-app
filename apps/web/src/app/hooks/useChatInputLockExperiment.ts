import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

/** `persist: 'local'` and no shell lane, so the Lab switch writes the local lane. */
export const setChatInputLockExperiment = (value: boolean): void => {
    config.set('feature.chatInputLock', value, { lane: 'local' });
};

/** The Lab switch behind the chat input lock. Off unless this device turned it on. */
export const useChatInputLockExperiment = () => {
    const isEnabled = useConfigValue<boolean>('feature.chatInputLock') === true;
    return { isEnabled, setEnabled: setChatInputLockExperiment };
};
