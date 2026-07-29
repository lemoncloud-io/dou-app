/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY — Track A contract mocks. DELETE THIS FILE when Track A merges.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Track C (the invitee flow) consumes two Track A deliverables that do not exist yet. Both are
 * declared in the roadmap's "인터페이스 계약" section; the signatures below are that contract
 * verbatim, so swapping the real ones in is an import change and nothing else.
 *
 * Replacement checklist (one place, one consumer):
 *   1. delete this file
 *   2. in `RelayInviteDialog.tsx`, point the `PhoneVerifyScreen` import at Track A's module
 *   3. re-run `useRelayInviteFlow.test.ts` / `RelayInviteDialog.test.tsx`
 *
 * See docs: apps/web/docs/feature/invite/relay-invite-accept.md · docs/adr/0033-…
 */
import type { JSX } from 'react';

import { Button } from '@chatic/web-ui-kit';

/** Where the verification was entered from. Decides copy and what happens after `onVerified`. */
export type PhoneVerifyContext = 'invite-accept' | 'invite-create';

export interface PhoneVerifyScreenProps {
    context: PhoneVerifyContext;
    /** Invite code, sent alongside `step=send` so the server can reject a mismatched number. */
    inviteCode?: string;
    /** Fired once the code checked out AND the session was switched to the main user. */
    onVerified: () => void;
    /** Fired when the user backs out without verifying. */
    onClose: () => void;
}

/**
 * TODO(track-a): replace with the real PhoneVerifyScreen.
 *
 * A placeholder panel with the two exits the contract promises. It performs no verification, so the
 * relay accept step that follows it will still be rejected by the server (403 → the flow re-checks
 * `needVerify` and comes back here) — which is the correct behaviour to develop against.
 */
export const PhoneVerifyScreen = ({ context, inviteCode, onVerified, onClose }: PhoneVerifyScreenProps): JSX.Element => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-[18px] font-semibold text-foreground">[Track A 목] 전화번호 인증</p>
        <p className="text-[14px] text-description">
            context={context}
            {inviteCode ? ' · 초대 코드 동봉' : ''}
        </p>
        <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={onClose}>
                닫기
            </Button>
            <Button size="lg" onClick={onVerified}>
                인증 완료(목)
            </Button>
        </div>
    </div>
);

/**
 * TODO(track-a): replace with the real applySessionToken.
 *
 * Pushes the `$token` from `verify-hash-alias step=check` into the sockets so the connection identity
 * becomes the main user. Track C never calls this directly — the contract says PhoneVerifyScreen has
 * already applied it by the time `onVerified` fires — but it is mocked here so the contract stays
 * visible in one place and a Track A change to that division of labour is a one-line fix.
 */
export const applySessionToken = async ($token: unknown): Promise<void> => {
    void $token;
};
