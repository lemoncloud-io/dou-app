import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { Button } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useMyProfile, useRelayInviteMutations, useRelayInvites, useSentInviteLog } from '../../../hooks';
import { useFormKeyboardFlow } from '../../../ui/hooks';
import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { getSocketErrorCode, toError } from '../../../utils/errors';
import { formatKoreanPhone, isValidKoreanPhone, normalizeKoreanPhone } from '../../channels/utils/koreanPhone';
import { ReinviteDialog } from '../components/ReinviteDialog';
import { resolveReinviteVariant, type ReinviteVariant } from '../utils/inviteStatus';
import { composeInviteSmsBody } from '../utils/inviteMessageCopy';
import { sendInviteMessage } from '../utils/sendInviteMessage';

const NAME_MAX = 20;
const PHONE_DIGITS_MAX = 11;

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
    const [phoneDigits, setPhoneDigits] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingReinvite, setPendingReinvite] = useState<PendingReinvite | null>(null);

    const { invites } = useRelayInvites();
    const { createInvite } = useRelayInviteMutations();
    const { record, findByPhone } = useSentInviteLog();
    const { profile: myProfile } = useMyProfile();

    const handlePhoneChange = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, PHONE_DIGITS_MAX);
        setPhoneDigits(digits);
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

    const isSubmitDisabled = !name.trim() || !phoneDigits || isSubmitting || !!phoneError;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('contactInvite.title')} />

            <div className="flex flex-1 flex-col overflow-y-auto overscroll-none">
                <div ref={fieldsRef} className="flex flex-col gap-[26px] px-4 pt-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold leading-[1.286] tracking-[0.005em] text-muted-foreground">
                            {t('contactInvite.nameLabel')}
                        </label>
                        <div className="flex items-center rounded-[10px] border border-border bg-background px-3 py-3">
                            <input
                                value={name}
                                onChange={e => setName(e.target.value.slice(0, NAME_MAX))}
                                placeholder={t('contactInvite.namePlaceholder')}
                                className="flex-1 bg-transparent text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                            <span className="shrink-0 text-[13px] font-medium tracking-[0.019em] text-muted-foreground opacity-74">
                                {name.length}/{NAME_MAX}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold leading-[1.286] tracking-[0.005em] text-muted-foreground">
                            {t('contactInvite.phoneLabel')}
                        </label>
                        <div
                            className={`flex items-center rounded-[10px] border bg-background px-3 py-3 ${phoneError ? 'border-destructive' : 'border-border'}`}
                        >
                            <input
                                value={formatKoreanPhone(phoneDigits)}
                                onChange={e => handlePhoneChange(e.target.value)}
                                placeholder={t('contactInvite.phonePlaceholder')}
                                type="tel"
                                className="flex-1 bg-transparent text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                            <span className="shrink-0 text-[13px] font-medium tracking-[0.019em] text-muted-foreground opacity-74">
                                {phoneDigits.length}/{PHONE_DIGITS_MAX}
                            </span>
                        </div>
                        {phoneError && <span className="text-[12px] text-destructive">{phoneError}</span>}
                        {/* Server-rendered validity — never a hardcoded duration (ADR-0033 D8). */}
                        <span className="text-[12px] text-muted-foreground">{t('contactInvite.validityHint')}</span>
                    </div>
                </div>
            </div>

            <div className="shrink-0 px-4 pb-safe-bottom pt-3">
                <Button tone="green" size="lg" fullWidth loading={isSubmitting} disabled={isSubmitDisabled} onClick={handleSubmit}>
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
