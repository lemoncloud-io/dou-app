import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { FloatingButton, TextField } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    useActivePlaceName,
    useLinkedAccounts,
    useMyProfile,
    usePlaceProfileAbsent,
    useRelayInviteMutations,
    useRelayInvites,
    useSentInviteLog,
    type AccountLinkMode,
} from '../../../hooks';
import { useFormKeyboardFlow } from '../../../ui/hooks';
import { CountrySelect } from '../../../ui/components/CountrySelect';
import { PageHeader } from '../../../ui/components';
// Direct path, not the `ui/layouts` barrel: the barrel reaches web-core / libs/shared, whose
// `import.meta` the CommonJS test transform cannot parse (directory-structure.md §6).
import { KeyboardAwareLayout } from '../../../ui/layouts/KeyboardAwareLayout';
import { ROUTES } from '../../../routes/paths';
import { getSocketErrorCode } from '../../../utils/errors';
import {
    isValidMobileNumber,
    readInternationalInput,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    type PhoneCountry,
} from '../../../utils/phoneNumber';
import { PhoneVerifySheet } from '../../auth/components/PhoneVerifySheet';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';
import { useSetMyPlaceProfile } from '../../../hooks';
import { InviterVerifyPrompt } from '../components/InviterVerifyPrompt';
import { ReinviteDialog } from '../components/ReinviteDialog';
import { useRetireInvite, type RetireOutcome } from '../hooks/useRetireInvite';
import { resolveReinviteVariant, type ReinviteVariant } from '../utils/inviteStatus';
import { composeInviteSmsBody } from '../utils/inviteMessageCopy';
import { sendInviteMessage } from '../utils/sendInviteMessage';

const NAME_MAX = 20;
/** Raw entry is kept as typed so a bad format stays visible (Figma 3268-35795); digits drive logic. */
const PHONE_INPUT_MAX = 20;

/**
 * One validated recipient. The packet and the local issuance log both want E.164 — `invite.create`
 * because the backend's phone hasher only reads `countryCode` on a local (`0…`) number and silently
 * ignores it once the string already starts with `+` (chatic-backend-api `asE164Phone`), so E.164 is
 * the one form that is correct with or without a trustworthy `countryCode`; the log because it is
 * keyed by E.164 so numbers from different countries cannot collide (ADR-0044 §6). `country` is kept
 * only for the `countryCode` field, which the packet still accepts and costs nothing to send.
 */
interface IssueTarget {
    country: PhoneCountry;
    e164: string;
}

interface PendingReinvite {
    variant: ReinviteVariant;
    inviteId: string;
    /** The recipient the form currently holds — reissuing resubmits with this. */
    target: IssueTarget;
}

/**
 * Route state that turns this page into "invite this person back into that room" (ADR-0068 결정 3).
 *
 * Arrives from the 1:1 room's own footer CTA. `name`/`phone` are best-effort prefill — the server
 * never returns a full number, so a device that did not issue the original invite has nothing to
 * seed the field with and the user types it. That is a normal path, not an error: reaching the form
 * with an empty number IS the feature.
 */
interface ReinviteEntry {
    channelId: string;
    name?: string;
    /** E.164, as the issue log stores it. */
    phone?: string;
}

/**
 * 연락처로 초대 페이지 (ADR-0033 Track B) — the home ＋menu "1:1 대화" destination.
 * Figma 3266-35386 (입력됨) / 3268-35795 (검증 에러) / 3578-67319 (게스트 인증 유도).
 *
 * Only a main user can issue a relay invite, so a device user never reaches the form: the page
 * intercepts with `InviterVerifyPrompt` and verifies in a sheet first (ADR-0034). `isGuest` is
 * reactive, so finishing verification swaps this screen to the form on the next render.
 */
export const ContactInvitePage = () => {
    const { t } = useTranslation();
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const fieldsRef = useRef<HTMLDivElement>(null);
    useFormKeyboardFlow(fieldsRef);
    /** Verification is offered at most once per visit, so a 403 that verification cannot fix (a
     *  withdrawn/suspended account) explains itself instead of reopening the sheet forever. */
    const verifyOfferedRef = useRef(false);

    // Present only when the 1:1 room sent us here to bring somebody back (see ReinviteEntry).
    const reinviteEntry = (useLocation().state as { reinvite?: ReinviteEntry } | null)?.reinvite;
    // A logged number is E.164, so it is split the same way a pasted `+81…` is — picker and field
    // never end up pointing at different countries. Memoized because only the state initializers
    // below read it: without this, libphonenumber re-parses on every keystroke for nothing.
    const prefilledPhone = useMemo(
        () => (reinviteEntry?.phone ? readInternationalInput(reinviteEntry.phone) : null),
        [reinviteEntry?.phone]
    );

    const [name, setName] = useState(reinviteEntry?.name ?? '');
    const [phoneInput, setPhoneInput] = useState(() => prefilledPhone?.national ?? '');
    // The prefilled number's own country wins; otherwise the last explicit pick, else the device
    // locale's region, else nothing (ADR-0044 §4).
    const [country, setCountry] = useState<PhoneCountry | null>(
        () => prefilledPhone?.country ?? resolveDefaultCountry()
    );
    const [phoneError, setPhoneError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingReinvite, setPendingReinvite] = useState<PendingReinvite | null>(null);
    /**
     * Which proof the sheet is running, or `null` when it is closed. The mode is stored rather than
     * derived at render time because the two ways in disagree: the gate picks from the session role,
     * while the 403 fallback KNOWS the server does not see a main user regardless of what the role
     * cache says.
     */
    const [verifyMode, setVerifyMode] = useState<AccountLinkMode | null>(null);

    const { isGuest } = useRuntimeProfile();
    // A main user with no number of their own can still be asked for one (guide §A-1 left this open),
    // but only when the server actually SAID so: `'unknown'` covers both "profile not loaded" and
    // "the slot was never built", and treating either as absent would demand a number the user
    // already has. So the gate narrows on `'absent'` alone (ADR-0042 §5, §6).
    const linked = useLinkedAccounts();
    const needsPhoneLink = !isGuest && linked.phone === 'absent';
    /** Guests open a session; a main user without a number hangs one on the session they have. */
    const gateVerifyMode: AccountLinkMode = isGuest ? 'login' : 'link';
    const { invites } = useRelayInvites();
    const { createInvite } = useRelayInviteMutations();
    const { retire } = useRetireInvite();
    const { record, findByPhone } = useSentInviteLog();
    const { profile: myProfile } = useMyProfile();
    // Second gate, after the guest one (ADR-0041 decision 4). `undefined` while the read is in
    // flight — the form must not render then either, or a submit could beat the verdict.
    const { absent: isProfileAbsent, markPresent } = usePlaceProfileAbsent();
    const placeName = useActivePlaceName();

    /**
     * Gates pass in order: prove a number first (a guest has none, and a main user may still lack
     * one), then require a place profile, then show the form.
     */
    const showForm = !isGuest && !needsPhoneLink && isProfileAbsent === false;

    const handlePhoneChange = (value: string) => {
        const next = value.slice(0, PHONE_INPUT_MAX);
        // A pasted `+81…` declares its own country, so the picker follows it and the field is
        // rewritten to the local form — the two never point at different countries.
        const international = readInternationalInput(next);
        if (international) {
            setCountry(international.country);
            rememberCountry(international.country);
            setPhoneInput(international.national);
        } else {
            setPhoneInput(next);
        }
        if (phoneError) setPhoneError('');
    };

    const handleCountryChange = (next: PhoneCountry) => {
        setCountry(next);
        rememberCountry(next);
        if (phoneError) setPhoneError('');
    };

    /** Returns the validated recipient on success, or `null` after setting the inline error. */
    const validatePhone = (): IssueTarget | null => {
        if (!country || !isValidMobileNumber(phoneInput, country)) {
            setPhoneError(t('contactInvite.phoneInvalidFormat'));
            return null;
        }
        return { country, e164: toE164(phoneInput, country) };
    };

    /** Issues (or re-issues) the invite, hands the deeplink to SMS/clipboard, then moves to the waiting screen. */
    const finishIssue = async (target: IssueTarget, recipientName: string) => {
        setIsSubmitting(true);
        try {
            const invite = await createInvite({
                phone: target.e164,
                name: recipientName,
                countryCode: target.country,
                // Naming the channel is what keeps a 1:1 ONE room across a leave and a return, instead
                // of a fresh room per invite (ADR-0068 결정 2). Omitted for a first-time invite — the
                // server makes the room on accept.
                channelId: reinviteEntry?.channelId,
            });
            if (!invite.id) throw new Error('invite.create response is missing an id');

            record(invite, { phone: target.e164, name: recipientName });

            const body = composeInviteSmsBody(t, myProfile?.nick, invite.deeplink ?? '');
            // E.164 for the composer: a bare local form only reaches the recipient when the sender's
            // own carrier is in the same country, which is exactly what this feature stops assuming.
            const channel = await sendInviteMessage(target.e164, body);
            toast({
                title:
                    channel === 'sms'
                        ? t('contactInvite.sentToast.sms')
                        : channel === 'clipboard'
                          ? t('contactInvite.sentToast.clipboard')
                          : t('contactInvite.sentToast.deliveryFailed'),
            });

            // A re-invite goes back where it was launched from: the room already narrates the
            // invite's state in its footer, so the standalone waiting screen would be a second,
            // redundant place to watch the same thing.
            navigate(reinviteEntry ? ROUTES.channels.room(reinviteEntry.channelId) : ROUTES.invite.waiting(invite.id), {
                replace: true,
            });
        } catch (error) {
            logger.error('INVITE', '[ContactInvitePage] send failed', { error });
            // 403 covers more than "still a guest" — §에러 코드 also lists withdrawn/suspended
            // accounts, for which verifying resolves to the SAME user and would 403 again. So offer
            // verification once (the gate below normally catches a plain guest first, so reaching
            // here means the client role lagged), then explain instead of looping.
            if (getSocketErrorCode(error) === 403 && !verifyOfferedRef.current) {
                verifyOfferedRef.current = true;
                // ALWAYS `login` here, never the gate's mode. Reaching this branch means the server
                // refused us as a main user, so the session has to be OPENED — sending `link` from a
                // session the server still reads as a device user would 403 again, which is the very
                // error this net exists to recover from.
                // The form keeps its input, so the user resubmits once verified — no auto-retry,
                // which would fire on a stale closure.
                setVerifyMode('login');
            } else if (getSocketErrorCode(error) === 403) {
                toast({ title: t('contactInvite.issueForbidden'), variant: 'destructive' });
            } else {
                toast({ title: t('contactInvite.issueFailed'), variant: 'destructive' });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    /**
     * Re-invite: retire whatever code this room still has out, then issue a fresh one.
     *
     * The same-number dialog is deliberately skipped here. It exists to stop a user who came to
     * "check on" an invite from silently issuing a second one — but arriving from the room's own
     * "다시 초대하기" IS the intent to send again, and the room's footer has already told them where
     * the last invite stands. What must not be skipped is the retire: two live codes for one person
     * is the state the sender flow has always avoided (ADR-0043 결정 5).
     */
    const reissueIntoChannel = async (channelId: string, target: IssueTarget, recipientName: string) => {
        const prior = invites.find(
            row =>
                row.channelId === channelId &&
                !row.dismissedAt &&
                (row.state === 'pending' || row.state === 'expired' || row.state === 'rejected')
        );
        if (!prior) {
            await finishIssue(target, recipientName);
            return;
        }

        // Held across the retire round trip, which `finishIssue` does not cover. Unlike the dialog
        // path (whose sheet closes on the way in), the form's submit button stays on screen here — a
        // second tap during the cancel would retire twice and issue two codes, the very state the
        // retire exists to prevent.
        setIsSubmitting(true);
        let outcome: RetireOutcome;
        try {
            outcome = await retire(prior);
        } catch (error) {
            // `retire` reports failure as an outcome rather than throwing, so this is the unforeseen
            // case; give the button back rather than leaving the form wedged.
            logger.error('INVITE', '[ContactInvitePage] retire failed', { error });
            toast({ title: t('contactInvite.issueFailed'), variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }

        // 409 — the recipient accepted while we were on this screen. Issuing now would hand out a
        // code nobody needs, so go look at the room instead.
        if (outcome === 'conflict') {
            setIsSubmitting(false);
            toast({ title: t('contactInvite.reinviteAlreadyAccepted') });
            navigate(ROUTES.channels.room(channelId), { replace: true });
            return;
        }

        // `finishIssue` owns the flag from here — it sets it again and clears it in its `finally`.
        await finishIssue(target, recipientName);
    };

    const handleSubmit = () => {
        if (isSubmitting) return;
        const trimmedName = name.trim();
        if (!trimmedName) return;
        const target = validatePhone();
        if (!target) return;

        if (reinviteEntry) {
            void reissueIntoChannel(reinviteEntry.channelId, target, trimmedName);
            return;
        }

        const priorEntry = findByPhone(target.e164);
        if (priorEntry) {
            const matched = invites.find(item => item.id === priorEntry.inviteId);
            setPendingReinvite({
                variant: resolveReinviteVariant(matched?.state),
                inviteId: priorEntry.inviteId,
                target,
            });
            return;
        }

        void finishIssue(target, trimmedName);
    };

    const handleReissue = async () => {
        if (!pendingReinvite) return;
        const { target, inviteId } = pendingReinvite;
        setPendingReinvite(null);
        // Retire the prior invite before issuing a fresh code (ADR-0043 결정 5). Only the
        // expired/declined variants reach this handler (pending only navigates to the waiting
        // screen), so retiring never blocks the reissue: an expired link is already dead
        // (best-effort server cancel tidies the list) and a rejected one is dismissed locally.
        const prior = invites.find(item => item.id === inviteId);
        if (prior) await retire(prior);
        void finishIssue(target, name.trim());
    };

    const handleViewWaiting = () => {
        if (!pendingReinvite) return;
        navigate(ROUTES.invite.waiting(pendingReinvite.inviteId));
    };

    // The counter is allowed to read "21/20" (Figma 3268-35795) rather than silently truncating.
    const nameError = name.length > NAME_MAX ? t('contactInvite.nameTooLong') : '';
    // `!country` joins the disabled conditions rather than the error ones: with no country there is
    // nothing to validate the number against, and the user has not made a mistake (ADR-0044 §4).
    const isSubmitDisabled =
        !name.trim() || !phoneInput.trim() || !country || isSubmitting || !!phoneError || !!nameError;

    // ONE return with the sheet in a fixed child slot. Two returns would put it at a different index
    // per branch, and React reconciles by position — so the promotion (which flips `isGuest` as soon
    // as the token is committed, BEFORE the socket switch settles) would unmount the live sheet
    // mid-switch and throw away its `pendingToken` retry.
    return (
        <KeyboardAwareLayout
            header={<PageHeader title={t('contactInvite.title')} />}
            // The guest branch carries its own inline CTA (Figma 3578-67319), so no docked panel there.
            // No CTA either while a gate is unresolved or open — the form it submits is not on screen.
            footer={
                showForm ? (
                    <FloatingButton
                        label={t('contactInvite.submit')}
                        loading={isSubmitting}
                        disabled={isSubmitDisabled}
                        onClick={handleSubmit}
                    />
                ) : undefined
            }
        >
            {/* Neither a guest nor a number-less main user can issue, so the form waits. Both land on
                the same prompt — what differs is the mode the sheet then runs in. */}
            {(isGuest || needsPhoneLink) && <InviterVerifyPrompt onStart={() => setVerifyMode(gateVerifyMode)} />}

            {showForm && (
                <>
                    <div className="flex flex-col gap-4 px-4 pt-6">
                        <h2 className="whitespace-pre-line text-center text-[20px] font-bold leading-[27px] text-foreground">
                            {t('contactInvite.heading')}
                        </h2>
                        <div className="flex flex-col text-center text-[14px] font-medium leading-[20px]">
                            <p className="whitespace-pre-line text-placeholder">{t('contactInvite.headingNote')}</p>
                            {/* Server-rendered validity — never a hardcoded duration (ADR-0033 D8). */}
                            <p className="text-description">{t('contactInvite.validityHint')}</p>
                        </div>
                    </div>

                    <div ref={fieldsRef} className="flex flex-col gap-6 pb-6 pt-8">
                        <TextField
                            label={t('contactInvite.nameLabel')}
                            required
                            value={name}
                            onChange={setName}
                            placeholder={t('contactInvite.namePlaceholder')}
                            maxLength={NAME_MAX}
                            enforceMaxLength={false}
                            error={nameError || undefined}
                            description={t('contactInvite.nameHint')}
                        />

                        <TextField
                            label={t('contactInvite.phoneLabel')}
                            required
                            value={phoneInput}
                            onChange={handlePhoneChange}
                            placeholder={t('contactInvite.phonePlaceholder')}
                            type="tel"
                            inputMode="numeric"
                            error={phoneError || undefined}
                            description={t('contactInvite.phoneHint')}
                            // A prop, not a sibling: the single-return/fixed-child-slot rule below
                            // is what keeps the verify sheet mounted, and the picker must not
                            // become one more node whose index moves between branches.
                            leading={<CountrySelect value={country} onChange={handleCountryChange} />}
                        />
                    </div>
                </>
            )}

            {pendingReinvite && (
                <ReinviteDialog
                    open
                    onOpenChange={next => !next && setPendingReinvite(null)}
                    variant={pendingReinvite.variant}
                    onViewWaiting={handleViewWaiting}
                    onReissue={handleReissue}
                />
            )}

            {verifyMode && (
                <PhoneVerifySheet
                    mode={verifyMode}
                    onVerified={() => setVerifyMode(null)}
                    onClose={() => setVerifyMode(null)}
                />
            )}

            {/* Issuing an invite without a place profile would send an SMS signed "친구"
                (contactInvite.defaultSenderName), so a profile is a precondition rather than a nag.
                No `exit` copy: X leaves for home immediately, which simply means no invite was sent
                (ADR-0041 decisions 2 and 4). `replace` so back cannot land on the dialog again.

                `!needsPhoneLink` for the same reason as `!isGuest`: the gates are ordered, and a main
                user who still owes a number would otherwise get this dialog stacked on top of the
                verify prompt. Number first, then name. */}
            {!isGuest && !needsPhoneLink && isProfileAbsent === true && (
                <PlaceProfileCreateDialog
                    onSubmit={setMyPlaceProfile}
                    open
                    placeName={placeName}
                    onDone={markPresent}
                    onExit={() => navigate(ROUTES.home, { replace: true })}
                />
            )}
        </KeyboardAwareLayout>
    );
};
