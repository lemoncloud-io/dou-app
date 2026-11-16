/**
 * The two fields that say whether a first subscription would start with a trial. `trialEligible` is
 * the server's own verdict (`GET /memberships/0/mine`); the client types of the backend package do
 * not list it yet, so it is read through this shape rather than off `MembershipView`.
 */
export interface TrialFields {
    trialEligible?: boolean | null;
    trialUsed?: boolean | null;
}

/**
 * Whether this account may start a subscription with a trial.
 *
 * The server's answer wins. A server that predates `trialEligible` omits it, and then the older
 * signal stands — the trial has not been used — which is the same rule the website applies.
 */
export const isTrialEligible = (membership: TrialFields | null | undefined): boolean =>
    membership?.trialEligible ?? !membership?.trialUsed;
