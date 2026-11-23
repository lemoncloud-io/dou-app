import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { FloatingButton, TextField } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    INVITE_EXPIRES_DAYS,
    useActivePlaceName,
    useLinkedAccounts,
    useMyProfile,
    usePlaceProfileAbsent,
    useRelayInviteMutations,
    useRelayInvites,
    useSentInviteLog,
    type AccountLinkMode,
} from '../../../hooks';
import { CountrySelect } from '../../../ui/components/CountrySelect';
import { PageHeader } from '../../../ui/components';
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
} from '@chatic/shared/phone';
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
const PHONE_INPUT_MAX = 20;

interface IssueTarget {
    country: PhoneCountry;
    e164: string;
}

interface PendingReinvite {
    variant: ReinviteVariant;
    inviteId: string;
    target: IssueTarget;
}

interface ReinviteEntry {
    channelId: string;
    name?: string;
    phone?: string;
}

export const ContactInvitePage = () => {
    const { t } = useTranslation();
    const setMyPlaceProfile = useSetMyPlaceProfile();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const verifyOfferedRef = useRef(false);

    const reinviteEntry = (useLocation().state as { reinvite?: ReinviteEntry } | null)?.reinvite;
    const prefilledPhone = useMemo(
        () => (reinviteEntry?.phone ? readInternationalInput(reinviteEntry.phone) : null),
        [reinviteEntry?.phone]
    );

    const [name, setName] = useState(reinviteEntry?.name ?? '');
    const [phoneInput, setPhoneInput] = useState(() => prefilledPhone?.national ?? '');
    const [country, setCountry] = useState<PhoneCountry | null>(
        () => prefilledPhone?.country ?? resolveDefaultCountry()
    );
    const [phoneError, setPhoneError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingReinvite, setPendingReinvite] = useState<PendingReinvite | null>(null);
    const [verifyMode, setVerifyMode] = useState<AccountLinkMode | null>(null);

    const { isGuest } = runtime.session.useRuntimeProfile();
    const linked = useLinkedAccounts();
    const needsPhoneLink = !isGuest && linked.phone === 'absent';
    const gateVerifyMode: AccountLinkMode = isGuest ? 'login' : 'link';
    const { invites } = useRelayInvites();
    const { createInvite } = useRelayInviteMutations();
    const { retire } = useRetireInvite();
    const { record, findByPhone } = useSentInviteLog();
    const { profile: myProfile } = useMyProfile();
    const { absent: isProfileAbsent, markPresent } = usePlaceProfileAbsent();
    const placeName = useActivePlaceName();

    const showForm = !isGuest && !needsPhoneLink && isProfileAbsent === false;

    const handlePhoneChange = (value: string) => {
        const next = value.slice(0, PHONE_INPUT_MAX);
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

    const validatePhone = (): IssueTarget | null => {
        if (!country || !isValidMobileNumber(phoneInput, country)) {
            setPhoneError(t('contactInvite.phoneInvalidFormat'));
            return null;
        }
        return { country, e164: toE164(phoneInput, country) };
    };

    const finishIssue = async (target: IssueTarget, recipientName: string) => {
        setIsSubmitting(true);
        try {
            const invite = await createInvite({
                phone: target.e164,
                name: recipientName,
                countryCode: target.country,
                channelId: reinviteEntry?.channelId,
            });
            if (!invite.id) throw new Error('invite.create response is missing an id');

            record(invite, { phone: target.e164, name: recipientName });

            const body = composeInviteSmsBody(t, myProfile?.nick, invite.deeplink ?? '');
            const channel = await sendInviteMessage(target.e164, body);
            toast({
                title:
                    channel === 'sms'
                        ? t('contactInvite.sentToast.sms')
                        : channel === 'clipboard'
                          ? t('contactInvite.sentToast.clipboard')
                          : t('contactInvite.sentToast.deliveryFailed'),
            });

            navigate(reinviteEntry ? ROUTES.channels.room(reinviteEntry.channelId) : ROUTES.invite.waiting(invite.id), {
                replace: true,
            });
        } catch (error) {
            logger.error('INVITE', '[ContactInvitePage] send failed', { error });
            if (getSocketErrorCode(error) === 403 && !verifyOfferedRef.current) {
                verifyOfferedRef.current = true;
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

        setIsSubmitting(true);
        let outcome: RetireOutcome;
        try {
            outcome = await retire(prior);
        } catch (error) {
            logger.error('INVITE', '[ContactInvitePage] retire failed', { error });
            toast({ title: t('contactInvite.issueFailed'), variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }

        if (outcome === 'conflict') {
            setIsSubmitting(false);
            toast({ title: t('contactInvite.reinviteAlreadyAccepted') });
            navigate(ROUTES.channels.room(channelId), { replace: true });
            return;
        }

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
        const prior = invites.find(item => item.id === inviteId);
        if (prior) await retire(prior);
        void finishIssue(target, name.trim());
    };

    const handleViewWaiting = () => {
        if (!pendingReinvite) return;
        navigate(ROUTES.invite.waiting(pendingReinvite.inviteId));
    };

    const nameError = name.length > NAME_MAX ? t('contactInvite.nameTooLong') : '';
    const isSubmitDisabled =
        !name.trim() || !phoneInput.trim() || !country || isSubmitting || !!phoneError || !!nameError;

    return (
        <KeyboardAwareLayout
            headerSafeArea={false}
            header={<PageHeader title={t('contactInvite.title')} />}
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
            {(isGuest || needsPhoneLink) && <InviterVerifyPrompt onStart={() => setVerifyMode(gateVerifyMode)} />}

            {showForm && (
                <>
                    <div className="flex flex-col gap-4 px-4 pt-6">
                        <h2 className="whitespace-pre-line text-center text-[20px] font-bold leading-[27px] text-foreground">
                            {t('contactInvite.heading')}
                        </h2>
                        <div className="flex flex-col text-center text-[14px] font-medium leading-[20px]">
                            <p className="whitespace-pre-line text-placeholder">{t('contactInvite.headingNote')}</p>
                            <p className="text-description">
                                {t('contactInvite.validityHintDays', { count: INVITE_EXPIRES_DAYS })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-6 pb-6 pt-8">
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
