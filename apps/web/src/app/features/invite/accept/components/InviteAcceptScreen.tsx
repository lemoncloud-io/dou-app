import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BrandMark, Button, IconClose, ProfileAvatar, Text } from '@chatic/web-ui-kit';

import { InviteGlassSurface } from './InviteGlassSurface';
import { InvitePlaceCard } from './InvitePlaceCard';
import { InviteTargetCard, type InviteTargetKind } from './InviteTargetCard';
import { InviteExpiryCard } from './InviteExpiryCard';
import type { InviteCountdown } from '../../hooks/useInviteCountdown';

export interface InviteAcceptScreenProps {
    inviterName?: string;
    inviterImage?: string;
    placeName?: string;
    placeIntro?: string;
    placeThumbnail?: string;
    memberCount?: number;
    countdown: InviteCountdown | null;
    targetKind?: InviteTargetKind;
    targetName?: string;
    isAccepting: boolean;
    onAccept: () => void;
    onClose: () => void;
    onDecline?: () => void;
    overlay?: ReactNode;
}

export const InviteAcceptScreen = ({
    inviterName,
    inviterImage,
    placeName,
    placeIntro,
    placeThumbnail,
    memberCount,
    countdown,
    targetKind,
    targetName,
    isAccepting,
    onAccept,
    onClose,
    onDecline,
    overlay,
}: InviteAcceptScreenProps) => {
    const { t } = useTranslation();

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
            <header className="relative z-10 flex items-center justify-between bg-transparent px-4 pb-2 pt-[calc(var(--safe-top,0px)+0.5rem)]">
                <BrandMark height={40} />
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('inviteAccept.close')}
                    className="flex size-11 items-center justify-center"
                >
                    <IconClose className="size-[26px] text-foreground" />
                </button>
            </header>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-2">
                <div className="flex flex-col items-center gap-2 pt-2">
                    <ProfileAvatar src={inviterImage} size={86} />
                    <div className="flex flex-col items-center gap-1 px-4 text-center">
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

                <div className="flex flex-col gap-4">
                    {showPlaceCard && (
                        <InvitePlaceCard name={placeName} intro={placeIntro} thumbnail={placeThumbnail} />
                    )}
                    {targetKind !== 'place' && (
                        <InviteTargetCard memberCount={memberCount} kind={targetKind} name={targetName} />
                    )}
                </div>

                {countdown && (
                    <div className="flex justify-center pb-2">
                        <InviteExpiryCard countdown={countdown} />
                    </div>
                )}
            </div>

            <div className="relative z-10 shrink-0 rounded-t-[16px] bg-white/55 px-4 pb-[calc(var(--safe-bottom,0px)+1rem)] pt-5 shadow-[0px_-10px_40px_0px_rgba(0,0,0,0.12)] dark:bg-white/5">
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
