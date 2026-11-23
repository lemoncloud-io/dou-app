export interface TrialFields {
    trialEligible?: boolean | null;
    trialUsed?: boolean | null;
}

export const isTrialEligible = (membership: TrialFields | null | undefined): boolean =>
    membership?.trialEligible ?? !membership?.trialUsed;
