import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { Button, TextField } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useMyProfile, useRelayInviteMutations, useRelayInvites, useSentInviteLog } from '../../../hooks';
import { useFormKeyboardFlow } from '../../../ui/hooks';
import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { getSocketErrorCode, toError } from '../../../utils/errors';
import { isValidKoreanPhone, normalizeKoreanPhone } from '../../channels/utils/koreanPhone';
import { ReinviteDialog } from '../components/ReinviteDialog';
import { resolveReinviteVariant, type ReinviteVariant } from '../utils/inviteStatus';
import { composeInviteSmsBody } from '../utils/inviteMessageCopy';
import { sendInviteMessage } from '../utils/sendInviteMessage';

const NAME_MAX = 20;
/** Raw entry is kept as typed so a bad format stays visible (Figma 3268-35795); digits drive logic. */
const PHONE_INPUT_MAX = 20;

interface PendingReinvite {
    variant: ReinviteVariant;
    inviteId: string;
    /** The normalized phone the form currently holds — reissuing resubmits with this. */
    phone: string;
}

/**
 * 연락처로 초대 페이지 (ADR-0033 Track B) — the home ＋menu "1:1 대화" destination.
 * Figma 3266-32434 (기본) / 3266-35386 (입력됨) / 3268-35795 (검증 에러).
 */
export const ContactInvitePage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const fieldsRef = useRef<HTMLDivElement>(null);
    useFormKeyboardFlow(fieldsRef);

    const [name, setName] = useState('');
    const [phoneInput, setPhoneInput] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingReinvite, setPendingReinvite] = useState<PendingReinvite | null>(null);

    const { invites } = useRelayInvites();
    const { createInvite } = useRelayInviteMutations();
    const { record, findByPhone } = useSentInviteLog();
    const { profile: myProfile } = useMyProfile();

    const phoneDigits = phoneInput.replace(/\D/g, '');

    const handlePhoneChange = (value: string) => {
        setPhoneInput(value.slice(0, PHONE_INPUT_MAX));
        if (phoneError) setPhoneError('');
    };

    /** Returns the normalized phone on success, or `null` after setting the inline error. */
    const validatePhone = (): string | null => {
        const normalized = normalizeKoreanPhone(phoneDigits);
        if (!isValidKoreanPhone(normalized)) {
            setPhoneError(t('contactInvite.phoneInvalidFormat'));
            return null;
        }
        return normalized;
    };

    /** Issues (or re-issues) the invite, hands the deeplink to SMS/clipboard, then moves to the waiting screen. */
    const finishIssue = async (phone: string, recipientName: string) => {
        setIsSubmitting(true);
        try {
            const invite = await createInvite({ phone, name: recipientName });
            if (!invite.id) throw new Error('invite.create response is missing an id');

            record(invite, { phone, name: recipientName });

            const body = composeInviteSmsBody(t, myProfile?.nick, invite.deeplink ?? '');
            const channel = await sendInviteMessage(phone, body);
            toast({
                title:
                    channel === 'sms'
                        ? t('contactInvite.sentToast.sms')
                        : channel === 'clipboard'
                          ? t('contactInvite.sentToast.clipboard')
                          : t('contactInvite.sentToast.deliveryFailed'),
            });

            navigate(ROUTES.invite.waiting(invite.id), { replace: true });
        } catch (error) {
            reportError(toError(error));
            // 403 = not a main user yet (client guide §A-1). Track A's PhoneVerifyScreen is the
            // sanctioned next step once it lands (roadmap 인터페이스 계약) — until then, surface it.
            const isGuestBlocked = getSocketErrorCode(error) === 403;
            toast({
                title: isGuestBlocked ? t('contactInvite.guestBlocked') : t('contactInvite.issueFailed'),
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = () => {
        if (isSubmitting) return;
        const trimmedName = name.trim();
        if (!trimmedName) return;
        const normalizedPhone = validatePhone();
        if (!normalizedPhone) return;

        const priorEntry = findByPhone(normalizedPhone);
        if (priorEntry) {
            const matched = invites.find(item => item.id === priorEntry.inviteId);
            setPendingReinvite({
                variant: resolveReinviteVariant(matched?.state),
                inviteId: priorEntry.inviteId,
                phone: normalizedPhone,
            });
            return;
        }

        void finishIssue(normalizedPhone, trimmedName);
    };

    const handleReissue = () => {
        if (!pendingReinvite) return;
        const { phone } = pendingReinvite;
        setPendingReinvite(null);
        void finishIssue(phone, name.trim());
    };

    const handleViewWaiting = () => {
        if (!pendingReinvite) return;
        navigate(ROUTES.invite.waiting(pendingReinvite.inviteId));
    };

    // The counter is allowed to read "21/20" (Figma 3268-35795) rather than silently truncating.
    const nameError = name.length > NAME_MAX ? t('contactInvite.nameTooLong') : '';
    const isSubmitDisabled = !name.trim() || !phoneDigits || isSubmitting || !!phoneError || !!nameError;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('contactInvite.title')} />

            <div className="flex flex-1 flex-col overflow-y-auto overscroll-none">
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

                <div ref={fieldsRef} className="flex flex-col gap-6 pt-8">
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
                    />
                </div>
            </div>

            <div className="shrink-0 px-4 pb-safe-bottom pt-3">
                <Button
                    tone="green"
                    size="lg"
                    fullWidth
                    loading={isSubmitting}
                    disabled={isSubmitDisabled}
                    onClick={handleSubmit}
                >
                    {t('contactInvite.submit')}
                </Button>
            </div>

            {pendingReinvite && (
                <ReinviteDialog
                    open
                    onOpenChange={next => !next && setPendingReinvite(null)}
                    variant={pendingReinvite.variant}
                    onViewWaiting={handleViewWaiting}
                    onReissue={handleReissue}
                />
            )}
        </div>
    );
};
