import { runtime } from '@chatic/runtime-react';

export const setPlaceInviteExperiment = (value: boolean): void => {
    runtime.settings.set('feature.placeInvite', value, { lane: 'local' });
};

export const usePlaceInviteExperiment = () => {
    const isEnabled = runtime.settings.useConfigValue<boolean>('feature.placeInvite') === true;
    return { isEnabled, setEnabled: setPlaceInviteExperiment };
};
