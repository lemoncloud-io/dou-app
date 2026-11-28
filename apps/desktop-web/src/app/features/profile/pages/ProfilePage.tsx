import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { runtime } from '@chatic/runtime-react';
import type { DomainProfile } from '@chatic/runtime-react';
import { Avatar, AvatarFallback, AvatarImage, Button } from '@chatic/ui-kit';
import { Skeleton, useCopyToClipboard } from '@chatic/design-system-components-desktop';

import {
    PageShell,
    avatarStyle,
    isPlaceholderName,
    resolveDisplay,
    useAccountName,
    useCurrentPlace,
    useMyProfile,
    useSiteProfileMap,
    useSiteProfiles,
} from '../../../shared';
import { AppleIcon, GoogleIcon, isSocialLoginEnabled, phoneSignupNoteKey, useSocialLogin } from '../../auth';
import { EditPlaceProfileDialog, PlaceChip } from '../components';
import { useEditPlaceProfileDialogStore } from '../stores';

interface ProfileFieldProps {
    label: string;
    value: string;
    onCopy?: () => void;
    copied?: boolean;
    copyLabel?: string;
    copiedLabel?: string;
}

const ProfileField = ({ label, value, onCopy, copied, copyLabel, copiedLabel }: ProfileFieldProps) => (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
        <div className="flex min-w-0 flex-col gap-1">
            <span className="text-overline uppercase text-muted-foreground">{label}</span>
            <span className="truncate text-callout text-foreground select-text">{value}</span>
        </div>
        {onCopy && (
            <Button variant="ghost" size="sm" onClick={onCopy} className="shrink-0 text-primary-ink">
                {copied ? copiedLabel : copyLabel}
            </Button>
        )}
    </div>
);

const SectionTitle = ({ children }: { children: string }) => (
    <h2 className="text-overline uppercase text-muted-foreground">{children}</h2>
);

export const ProfilePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { userId } = runtime.session.useSessionIdentity();
    const { photo } = runtime.session.useRuntimeProfile();
    const accountName = useAccountName();
    const accountUser = runtime.session.getRelaySessionUser() as {
        uid?: string;
        id?: string;
        email?: string;
        name?: string;
        userRole?: string;
    } | null;
    const accountUid = accountUser?.uid ?? accountUser?.id;
    const [copied, copy] = useCopyToClipboard();
    const openEditPlaceProfile = useEditPlaceProfileDialogStore(s => s.open);
    const { start: startSocialLogin, isStarting } = useSocialLogin();

    useSiteProfiles();
    const { placeName, placeId } = useCurrentPlace();
    const placeLabel = placeName || t('profile.thisPlaceFallback');
    const cachedPlaceProfile = useSiteProfileMap()[userId ?? ''];
    const { load: loadPlaceProfile } = useMyProfile();
    const [placeRead, setPlaceRead] = useState<{ profile: DomainProfile | null } | null>(null);
    useEffect(() => {
        let live = true;
        void loadPlaceProfile().then(profile => {
            if (live) setPlaceRead({ profile });
        });
        return () => {
            live = false;
        };
    }, [loadPlaceProfile]);
    const placeProfile = cachedPlaceProfile ?? placeRead?.profile ?? undefined;
    const hasPlaceProfile = !!placeProfile;
    const placeStateKnown = !!cachedPlaceProfile || placeRead !== null;

    const fallback = t('profile.unknown');
    const ownName = isPlaceholderName(accountUser?.name)
        ? accountUser?.userRole === 'guest'
            ? t('profile.guestName')
            : ''
        : (accountUser?.name ?? '').trim();
    const name = ownName || fallback;
    const email = accountUser?.email || t('profile.notSet');
    const uid = accountUid ?? fallback;
    const showSocialLogin = accountUser?.userRole === 'guest' && isSocialLoginEnabled();
    const phoneNoteId = useId();

    const { name: displayName, thumbnail: displayPhoto } = resolveDisplay(
        placeProfile,
        accountName || fallback,
        photo ?? undefined
    );
    const initial = (placeProfile?.nick?.trim() || accountName).charAt(0).toUpperCase() || '?';

    const handleCopyUid = () => {
        if (accountUid) copy(accountUid);
    };

    return (
        <PageShell title={t('profile.title')} backTo="/" backLabel={t('cloud.home')} contentClassName="space-y-8">
            {placeId && (
                <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <SectionTitle>{t('profile.thisPlace')}</SectionTitle>
                        {placeName && <PlaceChip name={placeName} />}
                    </div>
                    {placeStateKnown ? (
                        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
                            <Avatar className="h-16 w-16 rounded-xl">
                                {displayPhoto && (
                                    <AvatarImage src={displayPhoto} alt={displayName} className="rounded-xl" />
                                )}
                                <AvatarFallback
                                    className="rounded-xl text-title"
                                    style={avatarStyle(userId || displayName)}
                                >
                                    {initial}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="truncate text-title tracking-tight text-foreground">
                                    {displayName}
                                </span>
                                <span className="text-caption text-muted-foreground">
                                    {hasPlaceProfile
                                        ? t('profile.thisPlaceHint', { place: placeLabel })
                                        : t('profile.usingAccountHere')}
                                </span>
                            </div>
                            <Button
                                variant={hasPlaceProfile ? 'outline' : 'default'}
                                size="sm"
                                onClick={openEditPlaceProfile}
                            >
                                {hasPlaceProfile ? t('profile.editPlace') : t('profile.setUpPlace')}
                            </Button>
                        </div>
                    ) : (
                        <div
                            role="status"
                            aria-label={t('chat.loading')}
                            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5"
                        >
                            <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
                            <div className="flex flex-1 flex-col gap-2">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-3 w-48" />
                            </div>
                        </div>
                    )}
                </section>
            )}

            <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                    <SectionTitle>{t('profile.account')}</SectionTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-primary-ink"
                        onClick={() => navigate('/account')}
                    >
                        {t('profile.manageAccount')}
                    </Button>
                </div>
                <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                    <ProfileField label={t('profile.name')} value={name} />
                    <ProfileField label={t('profile.email')} value={email} />
                    <ProfileField
                        label={t('profile.id')}
                        value={uid}
                        onCopy={accountUid ? handleCopyUid : undefined}
                        copied={copied}
                        copyLabel={t('profile.copy')}
                        copiedLabel={t('profile.copied')}
                    />
                </div>
                {showSocialLogin && (
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-callout font-medium text-foreground">{t('profile.signIn')}</span>
                            <span className="break-keep text-caption text-muted-foreground">
                                {t('profile.signInHint')}
                            </span>
                            <span id={phoneNoteId} className="break-keep text-caption text-muted-foreground">
                                {t(phoneSignupNoteKey())}
                            </span>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => void startSocialLogin('google')}
                                disabled={isStarting}
                                aria-describedby={phoneNoteId}
                            >
                                <GoogleIcon />
                                {t('auth.social.google')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => void startSocialLogin('apple')}
                                disabled={isStarting}
                                aria-describedby={phoneNoteId}
                            >
                                <AppleIcon />
                                {t('auth.social.apple')}
                            </Button>
                        </div>
                    </div>
                )}
            </section>
            {placeId && <EditPlaceProfileDialog />}
        </PageShell>
    );
};
