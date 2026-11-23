import { create } from 'zustand';

import type { OAuthProvider } from '../utils/oauth';
import type { OAuthStartIntent } from '../utils/oauthLoginStart';

export type LinkFailure = 'occupied' | 'typeLinked' | 'failed';

export interface OAuthAttempt {
    provider: OAuthProvider;
    intent: OAuthStartIntent;
    signedOutAtStart: boolean;
    startedAt?: number;
    nonce?: string;
}

interface OAuthAttemptState {
    attempt: OAuthAttempt | null;
    failed: boolean;
    linkFailure: LinkFailure | null;
    completing: boolean;
    begin: (attempt: OAuthAttempt) => void;
    opened: (startedAt: number, nonce: string) => void;
    fail: () => void;
    clear: () => void;
    setLinkFailure: (failure: LinkFailure | null) => void;
    setCompleting: (completing: boolean) => void;
}

export const useOAuthAttemptStore = create<OAuthAttemptState>(set => ({
    attempt: null,
    failed: false,
    linkFailure: null,
    completing: false,
    begin: attempt => set({ attempt, failed: false, linkFailure: null }),
    opened: (startedAt, nonce) => set(s => (s.attempt ? { attempt: { ...s.attempt, startedAt, nonce } } : s)),
    fail: () => set(s => (s.attempt ? { failed: true } : s)),
    clear: () => set({ attempt: null, failed: false }),
    setLinkFailure: linkFailure => set({ linkFailure }),
    setCompleting: completing => set({ completing }),
}));

export const selectHeldLogin = (s: OAuthAttemptState): boolean =>
    s.attempt?.intent === 'login' && s.attempt.signedOutAtStart;

export const selectAttemptBusy = (s: OAuthAttemptState): boolean =>
    s.completing || (s.attempt !== null && s.attempt.startedAt === undefined && !s.failed);
