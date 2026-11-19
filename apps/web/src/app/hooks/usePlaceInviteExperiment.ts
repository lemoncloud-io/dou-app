import { runtime } from '@chatic/runtime';

/** `persist: 'local'` and no shell lane, so the Lab switch writes the local lane. */
export const setPlaceInviteExperiment = (value: boolean): void => {
    runtime.settings.set('feature.placeInvite', value, { lane: 'local' });
};

/** The Lab switch behind the place invite. Off unless this device turned it on. */
export const usePlaceInviteExperiment = () => {
    const isEnabled = runtime.settings.useConfigValue<boolean>('feature.placeInvite') === true;
    return { isEnabled, setEnabled: setPlaceInviteExperiment };
};
