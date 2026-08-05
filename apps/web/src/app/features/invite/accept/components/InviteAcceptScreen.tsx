import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, IconClose, ProfileAvatar, Text, douMark } from '@chatic/web-ui-kit';

import { InviteGlassSurface } from './InviteGlassSurface';
import { InvitePlaceCard } from './InvitePlaceCard';
import { InviteTargetCard } from './InviteTargetCard';
import { InviteExpiryCard } from './InviteExpiryCard';
import type { InviteCountdown } from '../../hooks/useInviteCountdown';

export interface InviteAcceptScreenProps {
    inviterName?: string;
    inviterImage?: string;
    placeName?: string;
    placeIntro?: string;
    placeThumbnail?: string;
    memberCount?: number;
    /** Live countdown for the invite link; `null` (no expiry known) hides the validity card. */
    countdown: InviteCountdown | null;
    /**
     * Which kind of room the invite leads to. Drives the "You" card caption **and** whether the place
     * card exists at all — a 1:1 invite has no place to show (ADR-0037).
     */
    targetKind?: 'group' | 'oneToOne';
    /** True while the accept pipeline is in flight — disables dismissal and spins the CTA. */
    isAccepting: boolean;
    onAccept: () => void;
    /** Dismiss request (X, and decline unless `onDecline` is given); blocked by the caller while accepting. */
    onClose: () => void;
    /**
     * Decline action, when it is more than a dismissal. Defaults to `onClose` — the cloud flow has no
     * server-side decline, so there the two really are the same thing.
     */
    onDecline?: () => void;
    /** Overlay rendered above the screen, e.g. the "creating your room" spinner after an accept. */
    overlay?: ReactNode;
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
    countdown,
    targetKind,
    isAccepting,
    onAccept,
    onClose,
    onDecline,
    overlay,
}: InviteAcceptScreenProps) => {
    const { t } = useTranslation();

    // Both target kinds show the place — the invite is INTO a place either way, and the 1:1 design node
    // draws the card too (ADR-0037 decision 1 read that as leftover from the group node; it was not).
    // Still gated on having something to say: an icon-only shell is worse than no card, and every field
    // counts, or an intro-only invite would silently drop its copy.
    const showPlaceCard = Boolean(placeName || placeIntro || placeThumbnail);

    const heading = inviterName ? (
        <>
            <span className="text-[24px] font-bold">{inviterName}</span>
            {t('inviteAccept.invitedBy')}
        </>
    ) : (
        t('inviteAccept.title')
    );

    return (
        <InviteGlassSurface>
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
                        {/* Figma `blue_bk` (#102346). Reverted on dark, where the navy loses contrast
                            against the dark surface.

                            `overflow-wrap:anywhere` is load-bearing, not polish. The inviter's name is
                            free text, and `break-keep` refuses to split a Korean run — which also makes
                            that whole run the heading's MIN-content width. This block sits under
                            `items-center`, so it is sized to its content and simply grew past the
                            surface: a 16-char name measured 398px inside a 343px column, and the glass
                            surface clipped the overflow off-screen. `break-words` does not help — per
                            spec `overflow-wrap: break-word` leaves intrinsic sizing alone, and it was
                            measured making no difference. `anywhere` shrinks min-content instead, so
                            ordinary names still never break mid-word. */}
                        <Text
                            as="h1"
                            className="whitespace-pre-line break-keep [overflow-wrap:anywhere] text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-brand-ink dark:text-foreground"
                        >
                            {heading}
                        </Text>
                        <Text className="break-keep text-[14px] font-medium leading-[1.45] text-label">
                            {t('inviteAccept.description')}
                        </Text>
                    </div>
                </div>

                {/* Place + target cards. Which cards exist is the group / 1:1 difference. */}
                <div className="flex flex-col gap-4">
                    {showPlaceCard && (
                        <InvitePlaceCard name={placeName} intro={placeIntro} thumbnail={placeThumbnail} />
                    )}
                    <InviteTargetCard memberCount={memberCount} kind={targetKind} />
                </div>

                {/* Link validity countdown (hidden when no expiry is known) */}
                {countdown && (
                    <div className="flex justify-center pb-2">
                        <InviteExpiryCard countdown={countdown} />
                    </div>
                )}
            </div>

            {/* Footer: decline / accept — raised frosted panel per Figma. The dialog no longer adds a
                bottom safe inset (this screen is full-bleed), so the footer owns it here — mirrors the
                header's safe-top padding so the buttons clear the home indicator. */}
            <div className="relative z-10 shrink-0 rounded-t-[16px] bg-white/55 px-4 pb-[calc(var(--safe-bottom,0px)+1rem)] pt-5 shadow-[0px_-10px_40px_0px_rgba(0,0,0,0.12)] backdrop-blur-[16px] dark:bg-white/5">
                <div className="flex gap-1.5">
                    <Button variant="outline" fullWidth size="lg" onClick={onDecline ?? onClose} disabled={isAccepting}>
                        {t('inviteAccept.decline')}
                    </Button>
                    <Button fullWidth size="lg" loading={isAccepting} onClick={onAccept}>
                        {t('inviteAccept.accept')}
                    </Button>
                </div>
            </div>

            {overlay}
        </InviteGlassSurface>
    );
};
