import type { DomainChannel } from '@chatic/data';

import { isSelfChannel } from '../../../shared';

/** What the place already shows of each getting-started step. */
export interface WelcomeSignals {
    /** I own one of the place's channels. */
    ownsChannel: boolean;
    /** An invite into this place went out from this device. */
    invited: boolean;
    /** The place has a 1:1 with someone else. */
    hasDm: boolean;
    /** My profile in this place has a nick or a photo. */
    hasProfile: boolean;
}

export type WelcomeStepKey = 'channel' | 'invite' | 'dm' | 'profile';

/** The four steps in the design's order, each done or not, and how many are. */
export const welcomeProgress = (signals: WelcomeSignals) => {
    const steps: { key: WelcomeStepKey; done: boolean }[] = [
        { key: 'channel', done: signals.ownsChannel },
        { key: 'invite', done: signals.invited },
        { key: 'dm', done: signals.hasDm },
        { key: 'profile', done: signals.hasProfile },
    ];
    return { steps, done: steps.filter(step => step.done).length };
};

/**
 * Whether the main pane welcomes the reader instead of an empty room: a place of a workspace cloud
 * whose list has loaded with nothing in it but my notes-to-self room, and where I have not put the
 * page away. The default cloud has its own first run, and a cloud with no place has nothing to welcome
 * to.
 */
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
