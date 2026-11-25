import type { DomainChannel } from '@chatic/runtime-react';

import { isSelfChannel } from '../../../shared';

export interface WelcomeSignals {
    ownsChannel: boolean;
    invited: boolean;
    hasDm: boolean;
    hasProfile: boolean;
}

export type WelcomeStepKey = 'channel' | 'invite' | 'dm' | 'profile';

export const welcomeProgress = (signals: WelcomeSignals) => {
    const steps: { key: WelcomeStepKey; done: boolean }[] = [
        { key: 'channel', done: signals.ownsChannel },
        { key: 'invite', done: signals.invited },
        { key: 'dm', done: signals.hasDm },
        { key: 'profile', done: signals.hasProfile },
    ];
    return { steps, done: steps.filter(step => step.done).length };
};

export const shouldShowWelcome = ({
    isDefaultMode,
    hasPlace,
    isLoading,
    channels,
    dismissed,
}: {
    isDefaultMode: boolean;
    hasPlace: boolean;
    isLoading: boolean;
    channels: readonly DomainChannel[];
    dismissed: boolean;
}): boolean => !isDefaultMode && hasPlace && !isLoading && !dismissed && channels.every(isSelfChannel);
