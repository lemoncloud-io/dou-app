import { useTranslation } from 'react-i18next';

import { Button, IconClose, ProfileAvatar, Text, douMark } from '@chatic/web-ui-kit';

import { InvitePlaceCard } from './InvitePlaceCard';
import { InviteTargetCard } from './InviteTargetCard';
import { InviteExpiryCard } from './InviteExpiryCard';
import type { InviteCountdown } from '../../hooks';

export interface InviteAcceptScreenProps {
    inviterName?: string;
    inviterImage?: string;
    placeName?: string;
    placeIntro?: string;
    placeThumbnail?: string;
    memberCount?: number;
    /** Expiry epoch (ms); with a countdown it renders the validity card. */
    expiredAt?: number;
    countdown: InviteCountdown | null;
    /** True while the accept pipeline is in flight — disables dismissal and spins the CTA. */
    isAccepting: boolean;
    onAccept: () => void;
    /** Dismiss request (X / decline); the caller blocks it while accepting. */
    onClose: () => void;
}

/**
 * Presentational invite-accept screen: brand header, inviter heading, place / target / validity
 * cards, and the decline/accept footer. Pure props — no data fetching or routing (the InviteDialog
 * orchestrator owns those), which keeps it easy to preview and test.
 */
export const InviteAcceptScreen = ({
    inviterName,
    inviterImage,
    placeName,
    placeIntro,
    placeThumbnail,
    memberCount,
    expiredAt,
    countdown,
    isAccepting,
    onAccept,
    onClose,
}: InviteAcceptScreenProps) => {
    const { t } = useTranslation();

    const heading = inviterName ? (
        <>
            <span className="text-[24px] font-bold">{inviterName}</span>
            {t('inviteAccept.invitedBy')}
        </>
    ) : (
        t('inviteAccept.title')
    );

    return (
        <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-[#eef1e8] dark:bg-[#0c0e0b]">
            {/* Glassmorphism per Figma 3076-11341, built as three layers so the frosted surfaces read
                as glass: (1) a blurred organic brand-green (#b0ea10) bloom on a light base, (2) a
                full-screen "freeze" frost over it, then (3) the header/cards/footer float on top —
                their own backdrop-blur + translucency frost the green behind into glass. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                    background:
                        'radial-gradient(115% 72% at 50% 64%, rgba(176,234,16,0.60) 0%, rgba(176,234,16,0.20) 46%, rgba(176,234,16,0) 74%), radial-gradient(78% 52% at 80% 106%, rgba(176,234,16,0.55) 0%, rgba(176,234,16,0) 58%), radial-gradient(68% 44% at 10% 4%, rgba(176,234,16,0.16) 0%, rgba(176,234,16,0) 60%)',
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0 bg-[rgba(255,255,255,0.10)] backdrop-blur-[56px] dark:bg-[rgba(20,20,20,0.24)]"
            />

            {/* Header: brand character+wordmark (left) + close (right). The wide mark doesn't fit
                ModalTopBar's 44px slot, so this mirrors that bar's safe-area padding inline. */}
            <header className="relative z-10 flex items-center justify-between bg-transparent px-4 pb-2 pt-[calc(var(--safe-top,0px)+0.5rem)]">
                <img src={douMark} alt="DoU" className="h-10 w-auto" />
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('inviteAccept.close')}
                    className="flex size-11 items-center justify-center"
                >
                    <IconClose className="size-[26px] text-foreground" />
                </button>
            </header>

            {/* Scrollable body: min-h-0 lets it shrink+scroll so the footer never overlaps. */}
            <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-2">
                {/* Inviter + heading */}
                <div className="flex flex-col items-center gap-2 pt-2">
                    <ProfileAvatar src={inviterImage} size={86} />
                    <div className="flex flex-col items-center gap-1 px-4 text-center">
                        <Text
                            as="h1"
                            className="whitespace-pre-line break-keep text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground"
                        >
                            {heading}
                        </Text>
                        <Text className="break-keep text-[14px] font-medium leading-[1.45] text-description">
                            {t('inviteAccept.description')}
                        </Text>
                    </div>
                </div>

                {/* Place + target cards */}
                <div className="flex flex-col gap-4">
                    <InvitePlaceCard name={placeName} intro={placeIntro} thumbnail={placeThumbnail} />
                    <InviteTargetCard memberCount={memberCount} />
                </div>

                {/* Link validity countdown (hidden when no expiry is known) */}
                {expiredAt && countdown && (
                    <div className="flex justify-center pb-2">
                        <InviteExpiryCard expiredAt={expiredAt} countdown={countdown} />
                    </div>
                )}
            </div>

            {/* Footer: decline / accept — raised frosted panel per Figma. The dialog no longer adds a
                bottom safe inset (this screen is full-bleed), so the footer owns it here — mirrors the
                header's safe-top padding so the buttons clear the home indicator. */}
            <div className="relative z-10 shrink-0 rounded-t-[16px] bg-white/55 px-4 pb-[calc(var(--safe-bottom,0px)+1rem)] pt-5 shadow-[0px_-10px_40px_0px_rgba(0,0,0,0.12)] backdrop-blur-[16px] dark:bg-white/5">
                <div className="flex gap-1.5">
                    <Button variant="outline" fullWidth size="lg" onClick={onClose} disabled={isAccepting}>
                        {t('inviteAccept.decline')}
                    </Button>
                    <Button fullWidth size="lg" loading={isAccepting} onClick={onAccept}>
                        {t('inviteAccept.accept')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
