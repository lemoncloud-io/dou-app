import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { applySessionToken } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useLinkAccount, type AccountLinkMode } from '../../../hooks/useLinkAccount';
import { getSocketErrorCode, VERIFICATION_CODE_LENGTH } from '../../../utils';
import { isDevBuild } from '../utils/env';
import {
    isValidMobileNumber,
    readInternationalInput,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    type PhoneCountry,
} from '../../../utils/phoneNumber';
import { useOtpExpiryCountdown, type OtpExpiryCountdown } from './useOtpExpiryCountdown';

/**
 * Resend/extend cap enforced client-side BEFORE the server is asked; a server 429 (60s cooldown,
 * daily caps) always wins over this counter (roadmap Track A). "Extend time" and "resend" are the
 * same server step — the backend has no extend concept (ADR-0033 D9) — so one counter covers both,
 * even though the design gives each control its own over-limit dialog.
 */
const RESEND_LIMIT = 5;

/** The raw phone field accepts what the user typed so a bad format is visible; digits drive logic. */
const PHONE_INPUT_MAX = 20;

type LoadingState = 'idle' | 'sending' | 'resending' | 'verifying';
/** Which control tripped the client-side cap — picks the over-limit dialog's copy. */
export type PhoneVerifyLimit = 'resend' | 'extend';

/** What the state machine itself needs. Chrome concerns (`onClose`, `context`) are not here. */
export interface PhoneVerifyOptions {
    /**
     * Which side of the proof this is, derived by the caller from the session role — guest sessions
     * log in, main users link. Getting it wrong is an error rather than a fallback (main user +
     * `login` = 400, guest + `link` = 403), so it is required rather than defaulted (ADR-0042 §3).
     */
    mode: AccountLinkMode;
    /**
     * Invite code when verifying inside an accept flow. Sent on SEND only — the unified contract has
     * no slot for it on a prove step, and the number/invite cross-check happens once, at send time
     * (client guide §B-2). Ignored unless `mode` is `'login'`, which is the only mode the server reads
     * it in.
     */
    inviteCode?: string;
    /**
     * Last 4 digits of the invited number, when one is known. Compared BEFORE the send so a typo is
     * caught without spending a delivery against the daily caps (ADR-0042 §8). Four digits are not a
     * verdict — the server still cross-checks the whole number — so the 400 branch stays.
     */
    inviteLast4?: string;
    /** Fired after the proof succeeded AND the session/socket switch finished (main user active). */
    onVerified: () => void;
}

/** What every shell takes: the machine's options plus its own dismissal. */
export interface PhoneVerifyShellProps extends PhoneVerifyOptions {
    /** Fired when the user backs out (including via the social-login banner). */
    onClose: () => void;
}

/** What `PhoneVerifyFields` renders — every value it needs, already derived. */
export interface PhoneVerifyFieldsState {
    phoneInput: string;
    phoneError: string;
    onPhoneChange: (value: string) => void;
    /** Which country the number is read as. `null` until one is picked — a valid, quiet state. */
    country: PhoneCountry | null;
    onCountryChange: (country: PhoneCountry) => void;
    /** Whether 인증 요청 may fire: a valid number, no live code, nothing in flight. */
    canRequestCode: boolean;
    onRequestCode: () => void;
    otp: string;
    onOtpChange: (value: string) => void;
    /** A code is outstanding — the code field and 재전송 unlock, and the timer row appears. */
    codeSent: boolean;
    codeError: string;
    codeDescription: string;
    countdown: OtpExpiryCountdown | null;
    isBusy: boolean;
    /** Both 재전송 and 시간 연장 land here; the argument only picks the over-limit dialog. */
    onResend: (origin: PhoneVerifyLimit) => void;
    limit: PhoneVerifyLimit | null;
    onDismissLimit: () => void;
    showDevSwitches: boolean;
    devDryRun: boolean;
    onDevDryRunChange: (next: boolean) => void;
    devSlack: boolean;
    onDevSlackChange: (next: boolean) => void;
}

/** The submit CTA. Shells place it differently (pinned vs sheet footer) but wire it identically. */
export interface PhoneVerifySubmitState {
    /** A committed `$token` is waiting — the button retries the SWITCH, never the consumed check. */
    isRetry: boolean;
    disabled: boolean;
    loading: boolean;
    onSubmit: () => void;
}

export interface PhoneVerifyController {
    fields: PhoneVerifyFieldsState;
    submit: PhoneVerifySubmitState;
}

/**
 * The phone self-verification state machine over `auth.link-account`, independent of how it is
 * presented. `PhoneVerifyScreen` (full-screen), `PhoneVerifySheet` (bottom sheet) and the mypage login
 * section all drive it.
 *
 * **The two modes end differently, so they take different routes through the packet's steps.**
 * - `login` — confirming IS a login. The response carries `$token`, and `applySessionToken` pushes
 *   that identity into web-core and the live relay socket BEFORE `onVerified` fires, so the caller can
 *   immediately `invite.create`/`invite.accept` without a 403. `verify` is skipped: it would only
 *   report that the code is valid, which `confirm` already proves (ADR-0042 §4).
 * - `link` — confirming hangs the number on the session that is already a main user. No token comes
 *   back. Here `verify` runs FIRST, because it is the only step that will say confirming is blocked
 *   (`linkable: false` + `reason`); `confirm` answers the same situation with a 409/403. So the code
 *   field verifies on completion and the CTA confirms.
 *
 * Error copy branches on `getSocketErrorCode` only — server messages are not a contract. See
 * apps/web/docs/feature/auth/phone-verification.md for the full case table.
 */
export const usePhoneVerify = ({
    mode,
    inviteCode,
    inviteLast4,
    onVerified,
}: PhoneVerifyOptions): PhoneVerifyController => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { send, verify, confirm } = useLinkAccount();

    const [phoneInput, setPhoneInput] = useState('');
    const [phoneError, setPhoneError] = useState('');
    // Last explicit pick, else the device locale's region, else nothing (ADR-0044 §4). Read once, at
    // mount: the field opens on it and the user owns it from there.
    const [country, setCountry] = useState<PhoneCountry | null>(resolveDefaultCountry);
    /**
     * The `{phone, country}` the outstanding code was actually sent with, pinned at send time.
     *
     * The prove steps read THIS, not the live field. The contract requires the same country on send
     * and on proof — "발송과 증명에 같은 값" (05-client-guide.md §계약) — and reading live state made
     * that depend on the invalidation below never missing a case. Pinning makes it structural.
     */
    const [sentWith, setSentWith] = useState<{ phone: string; country: PhoneCountry } | null>(null);
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [expiredAt, setExpiredAt] = useState<number | undefined>(undefined);
    const [resendCount, setResendCount] = useState(0);
    const [limit, setLimit] = useState<PhoneVerifyLimit | null>(null);
    const [loadingState, setLoadingState] = useState<LoadingState>('idle');
    // The $token of a successful check, kept until applySessionToken succeeds: the OTP is consumed
    // by then, so a failed session switch retries the SWITCH, never the check.
    const [pendingToken, setPendingToken] = useState<unknown>(null);
    // `link` mode only: the verify step came back linkable, so the CTA may commit. Login mode never
    // sets this — it confirms straight from the code field.
    const [linkVerified, setLinkVerified] = useState(false);
    // Dev-only delivery switches; unset switches are omitted so server defaults survive (D13).
    const [devDryRun, setDevDryRun] = useState(false);
    const [devSlack, setDevSlack] = useState(false);

    /**
     * E.164, not the local form — `chatic-backend-api`'s phone hasher (`asE164Phone`) only reads
     * `countryCode` on a local (`0…`) number and silently ignores it once the string already starts
     * with `+`, so E.164 is the one form that is correct with or without a trustworthy `countryCode`
     * (ADR-0044 §5 correction). `countryCode` is still sent alongside — harmless, and what the
     * documented contract names.
     */
    const wirePhone = toE164(phoneInput, country);
    const countdown = useOtpExpiryCountdown(expiredAt);
    const isExpired = countdown?.isExpired ?? false;
    const isCodeComplete = otp.length === VERIFICATION_CODE_LENGTH;
    const resendExhausted = resendCount >= RESEND_LIMIT;
    const isBusy = loadingState !== 'idle';
    // A code is outstanding once a send/resend came back with an expiry. Retyping the number clears
    // it, which re-arms 인증 요청 for the new number (Figma greys it out while a code is live).
    const codeSent = expiredAt !== undefined;

    const devSwitches = () => ({
        ...(devDryRun ? { dryRun: true } : undefined),
        // Receiving over Slack means NOT over SMS (client guide §A-1 dev builds).
        ...(devSlack ? { slack: true, sms: false } : undefined),
    });

    // The server reads the invite code only on a `login` send. Passing it in `link` mode would be
    // dead weight in a packet that carries a credential, so it is dropped at the boundary.
    const sendInviteCode = mode === 'login' ? inviteCode : undefined;

    /**
     * A different number invalidates the outstanding code rather than silently checking it against
     * the new one — including the verify verdict, which was about the OLD number, and the send pin,
     * which is what the prove steps would otherwise carry forward.
     *
     * The country runs through the same block: a code sent to `+82 010…` is not the code for
     * `+81 010…`, so changing the country is the same event as retyping the number (ADR-0044 §5).
     */
    const invalidateOutstandingCode = () => {
        setExpiredAt(undefined);
        setSentWith(null);
        setOtp('');
        setOtpError('');
        setLinkVerified(false);
    };

    const handlePhoneChange = (value: string) => {
        const next = value.slice(0, PHONE_INPUT_MAX);
        // A pasted `+81…` declares its own country more precisely than the picker does, so the
        // picker follows the paste and the field is rewritten to the local form — one gesture
        // enters both. This is also how `+82…` finally works here; it used to fail validation.
        const international = readInternationalInput(next);
        if (international) {
            setCountry(international.country);
            rememberCountry(international.country);
            setPhoneInput(international.national);
        } else {
            setPhoneInput(next);
        }
        if (phoneError) setPhoneError('');
        invalidateOutstandingCode();
    };

    const handleCountryChange = (next: PhoneCountry) => {
        setCountry(next);
        rememberCountry(next);
        if (phoneError) setPhoneError('');
        invalidateOutstandingCode();
    };

    const handleSend = async () => {
        if (!country || !isValidMobileNumber(phoneInput, country)) {
            setPhoneError(t('phoneVerify.phoneInvalidFormat'));
            return;
        }
        // Cheapest rejection first: four digits we already hold beat a round trip that would burn one
        // of the day's deliveries. Not a verdict — the server re-checks the whole number at send.
        // Country-blind on purpose: last-4 across countries only ever over-reports, and the invite
        // carries no country of its own to compare against (ADR-0044 §6).
        if (inviteLast4 && !wirePhone.endsWith(inviteLast4)) {
            setPhoneError(t('phoneVerify.inviteMismatch'));
            return;
        }
        setLoadingState('sending');
        setPhoneError('');
        try {
            const result = await send(wirePhone, {
                mode,
                code: sendInviteCode,
                countryCode: country,
                ...devSwitches(),
            });
            setExpiredAt(result.expiredAt);
            setSentWith({ phone: wirePhone, country });
            setOtp('');
            setOtpError('');
            toast({ title: t('phoneVerify.sent') });
        } catch (error) {
            const code = getSocketErrorCode(error);
            // Always log the raw failure. A 400 has several documented causes (§에러 코드) and the
            // copy below can only guess at one of them — a production `@mode[login] is for device
            // session` read to users as a phone-number problem precisely because this catch was
            // silent, leaving the server's own message nowhere to be seen.
            logger.error('AUTH', `[usePhoneVerify] send failed (mode=${mode}, status=${code ?? '-'})`, { error });
            if (code === 400 && sendInviteCode) {
                // `sendInviteCode`, NOT `inviteCode`: the server only cross-checks the number against
                // the invite when the code actually rode along, which is the `login` send alone
                // (§B-2). Claiming a mismatch on a `link` send would blame the number for a check the
                // server never ran.
                setPhoneError(t('phoneVerify.inviteMismatch'));
            } else if (code === 429) {
                // First send tripping 429 is the daily cap (10/day per number, 20/day per device).
                setPhoneError(t('phoneVerify.tooManyRequests'));
            } else {
                toast({ title: t('phoneVerify.sendFailed'), variant: 'destructive' });
            }
        } finally {
            setLoadingState('idle');
        }
    };

    /**
     * Shared by 재전송 and 시간 연장 — both are `step=resend` (D9). Past the client cap the server
     * is never asked; the design answers with a per-control dialog instead of a dead button.
     */
    const handleResend = async (origin: PhoneVerifyLimit) => {
        if (resendExhausted) {
            setLimit(origin);
            return;
        }
        // Resend re-sends to what was pinned, never to whatever the field holds now: a resend is a
        // new code for the SAME number, and the pin is the only record of what that was.
        if (!sentWith) return;
        setLoadingState('resending');
        try {
            const result = await send(sentWith.phone, {
                mode,
                code: sendInviteCode,
                countryCode: sentWith.country,
                resend: true,
                ...devSwitches(),
            });
            setExpiredAt(result.expiredAt);
            setOtp('');
            setOtpError('');
            submittedOtpRef.current = null; // a fresh code makes the previous submission irrelevant
            setResendCount(count => count + 1);
            // The wrong-answer counter survives a resend (§발송 제한) — say so with the new code.
            toast({ title: t('phoneVerify.resent'), description: t('phoneVerify.resendKeepsCounter') });
        } catch (error) {
            if (getSocketErrorCode(error) === 429) {
                // Mid-flow resend tripping 429 is the 60s cooldown.
                setOtpError(t('phoneVerify.cooldown'));
            } else {
                toast({ title: t('phoneVerify.resendFailed'), variant: 'destructive' });
            }
        } finally {
            setLoadingState('idle');
        }
    };

    /** Applies a check-issued `$token`; kept separate so a failed switch is retryable on its own. */
    const applyToken = async (token: unknown) => {
        try {
            await applySessionToken(token);
            setPendingToken(null);
            toast({ title: t('phoneVerify.verified') });
            onVerified();
        } catch {
            setPendingToken(token);
            setOtpError(t('phoneVerify.sessionSwitchFailed'));
            setLoadingState('idle');
        }
    };

    /**
     * Shared failure copy for the prove steps.
     *
     * `403` is the one code that means two different things — a wrong OTP, or "you already linked a
     * different value for this credential" on a `link` confirm (§에러 코드). `vouched` disambiguates:
     * it is set only when a `verify` just accepted this very code, so a wrong OTP is no longer the
     * likely reading and `type-linked` is.
     */
    const reportProveError = (error: unknown, { vouched = false }: { vouched?: boolean } = {}) => {
        const code = getSocketErrorCode(error);
        // Same reason as the send path: every branch below narrows a status that the server uses for
        // more than one condition, so the raw message has to survive somewhere.
        logger.error('AUTH', `[usePhoneVerify] prove failed (mode=${mode}, status=${code ?? '-'})`, { error });
        if (code === 403) {
            setOtpError(t(vouched ? 'phoneVerify.linkTypeAlreadyLinked' : 'phoneVerify.wrongCode'));
        } else if (code === 429) {
            // 5 wrong answers — a fresh code will NOT reset the counter, but resending is still
            // the guided way out (roadmap Track A case table).
            setOtpError(t('phoneVerify.attemptsExceeded'));
        } else if (code === 400) {
            setOtpError(t('phoneVerify.codeExpired'));
        } else if (code === 409) {
            // `link` confirm only: the account turned out to belong to someone else.
            setOtpError(t('phoneVerify.linkOccupied'));
        } else {
            toast({ title: t('phoneVerify.verifyFailed'), variant: 'destructive' });
        }
        setLoadingState('idle');
    };

    /**
     * `link` mode's first step. Changes nothing, so it is safe on every code completion — and it is the
     * only place the server will TELL us confirming is blocked instead of throwing.
     */
    const handleVerifyStep = async () => {
        // No pin means no outstanding code — nothing to prove against.
        if (!sentWith) return;
        setLoadingState('verifying');
        setOtpError('');
        try {
            const result = await verify(sentWith.phone, otp, { mode, countryCode: sentWith.country });
            // `linkable` is absent on the login-mode view; this step only runs for `link`.
            if ('linkable' in result && !result.linkable) {
                setLinkVerified(false);
                setOtpError(
                    result.reason === 'type-linked'
                        ? t('phoneVerify.linkTypeAlreadyLinked')
                        : t('phoneVerify.linkOccupied')
                );
                setLoadingState('idle');
                return;
            }
            setLinkVerified(true);
            setLoadingState('idle');
        } catch (error) {
            setLinkVerified(false);
            reportProveError(error);
        }
    };

    const handleConfirm = async () => {
        if (!sentWith) return;
        setLoadingState('verifying');
        setOtpError('');
        try {
            const result = await confirm(sentWith.phone, otp, { mode, countryCode: sentWith.country });
            // A token only ever rides on the login-mode confirm; `link` leaves the session alone.
            if ('$token' in result && result.$token) {
                await applyToken(result.$token);
                return;
            }
            toast({ title: t('phoneVerify.verified') });
            onVerified();
        } catch (error) {
            // In `link` mode we only get here after a verify vouched for this code, so read a 403 as
            // `type-linked` rather than a wrong OTP.
            reportProveError(error, { vouched: mode === 'link' && linkVerified });
        }
    };

    const handleRetrySessionSwitch = async () => {
        if (!pendingToken) return;
        setLoadingState('verifying');
        setOtpError('');
        await applyToken(pendingToken);
    };

    const handleOtpChange = (value: string) => {
        setOtp(value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH));
        setOtpError('');
        // A different code has not been vouched for yet, so the CTA must go back through verify.
        setLinkVerified(false);
    };

    /**
     * Auto-submit once all digits are in (same convention as EmailVerifyDialog). Keyed on the VALUE,
     * not on a "is it complete" boolean, so pasting a corrected code over a full one still submits.
     * The ref — not `loadingState` — is the re-entry guard: a tap landing on the last typed digit
     * would otherwise race the state update and spend two of the five attempts on one code.
     *
     * Which step this fires depends on the mode: `login` commits right here, while `link` only asks
     * whether committing is allowed and leaves the commit to the CTA (ADR-0042 §4).
     */
    const submittedOtpRef = useRef<string | null>(null);
    useEffect(() => {
        if (otp.length !== VERIFICATION_CODE_LENGTH) return;
        if (isExpired || pendingToken || submittedOtpRef.current === otp) return;
        submittedOtpRef.current = otp;
        void (mode === 'link' ? handleVerifyStep() : handleConfirm());
    }, [otp]);

    /**
     * What the CTA does. In `link` mode a code that has not been vouched for goes through verify first,
     * so a user who taps before the auto-submit lands still gets the `linkable` answer rather than a
     * bare 409/403.
     */
    const handleSubmit = () => {
        if (pendingToken) return void handleRetrySessionSwitch();
        if (mode === 'link' && !linkVerified) return void handleVerifyStep();
        void handleConfirm();
    };

    return {
        fields: {
            phoneInput,
            phoneError,
            onPhoneChange: handlePhoneChange,
            country,
            onCountryChange: handleCountryChange,
            // No country means nothing to validate against, so the CTA is simply unavailable — the
            // user has not made a mistake yet, and a red line would say they had (ADR-0044 §4).
            canRequestCode: isValidMobileNumber(phoneInput, country) && !codeSent && !isBusy,
            onRequestCode: () => void handleSend(),
            otp,
            onOtpChange: handleOtpChange,
            codeSent,
            // Expiry is surfaced on the code field even without a failed check, so the row never
            // shows a live-looking timer next to a dead code.
            codeError: otpError || (isExpired ? t('phoneVerify.codeExpired') : ''),
            codeDescription: resendCount > 0 ? t('phoneVerify.resendKeepsCounter') : t('phoneVerify.digitsOnly'),
            countdown,
            isBusy,
            onResend: origin => void handleResend(origin),
            limit,
            onDismissLimit: () => setLimit(null),
            showDevSwitches: isDevBuild(),
            devDryRun,
            onDevDryRunChange: setDevDryRun,
            devSlack,
            onDevSlackChange: setDevSlack,
        },
        submit: {
            isRetry: !!pendingToken,
            disabled: pendingToken ? isBusy : !isCodeComplete || isBusy || isExpired,
            loading: loadingState === 'verifying',
            onSubmit: handleSubmit,
        },
    };
};
