import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft } from 'lucide-react';

import { getActiveSessionUser, useSessionIdentity } from '@chatic/web-core';
import { useSessionProfile } from '@chatic/app-runtime';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';

import {
    avatarStyle,
    isPlaceholderName,
    useCopyToClipboard,
    useCurrentPlace,
    useDisplayProfile,
    useSiteProfileMap,
    useSiteProfiles,
} from '../../../shared';
import { GoogleIcon, isSocialLoginEnabled, useSocialLogin } from '../../auth';
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
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="truncate text-sm text-foreground">{value}</span>
        </div>
        {onCopy && (
            <button
                onClick={onCopy}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
                {copied ? copiedLabel : copyLabel}
            </button>
        )}
    </div>
);

const SectionTitle = ({ children }: { children: string }) => (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
);

/**
 * Single profile surface. The "This place" card is how you appear in the current
 * place (per-place nick/photo, edited via the optimistic dialog); the "Account"
 * card is the read-only canonical (global) identity. One door — there is no
 * separate place-profile menu entry.
 */
export const ProfilePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    // Identity is uid-only now; profile facts (name/photo) come from useSessionProfile
    // and the account email from the active session token.
    const { userId } = useSessionIdentity();
    const { userName, photo } = useSessionProfile();
    const accountUser = getActiveSessionUser() as { email?: string } | null;
    const [copied, copy] = useCopyToClipboard();
    const openEditPlaceProfile = useEditPlaceProfileDialogStore(s => s.open);
    const { start: startSocialLogin } = useSocialLogin();

    // Keep the display store fed on this route too — HomePage's subscription is
    // unmounted here, so without this the optimistic self-edit would not reflect
    // in the "This place" card until navigating back home.
    useSiteProfiles();
    const { placeName } = useCurrentPlace();
    const placeLabel = placeName || t('profile.thisPlaceFallback');
    // Whether I have an active per-place override here (vs falling back to the
    // account). Resolved from the display store (fed by useSiteProfiles) by my
    // account uid.
    const hasPlaceProfile = !!useSiteProfileMap()[userId ?? ''];

    const fallback = t('profile.unknown');
    const name = userName || fallback;
    const email = accountUser?.email || t('profile.notSet');
    const uid = userId ?? fallback;
    // No email on the account ⇒ a Guest Session (Social Login backfills the
    // email) — offer the in-app Google link (ADR 0009; replaces the session).
    // Dev-only until the backend can restore joined clouds (see oauth.ts).
    const showSocialLogin = !accountUser?.email && isSocialLoginEnabled();

    // Effective display = my Place Profile when active, else the global identity.
    const globalName = isPlaceholderName(userName) ? '' : userName;
    const { name: displayName, thumbnail: displayPhoto } = useDisplayProfile(
        userId ?? '',
        globalName || fallback,
        photo
    );
    const initial = displayName.charAt(0).toUpperCase() || '?';

    const handleCopyUid = () => {
        if (userId) copy(userId);
    };

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => navigate('/')}>
                    <ChevronLeft className="h-4 w-4" />
                    {t('profile.back')}
                </Button>
                <h1 className="text-base font-semibold text-foreground">{t('profile.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <SectionTitle>{t('profile.thisPlace')}</SectionTitle>
                        {placeName && <PlaceChip name={placeName} />}
                    </div>
                    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
                        <Avatar className="h-16 w-16 rounded-xl ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
                            {displayPhoto && (
                                <AvatarImage src={displayPhoto} alt={displayName} className="rounded-xl" />
                            )}
                            <AvatarFallback
                                className="rounded-xl text-xl font-semibold"
                                style={avatarStyle(userId || displayName)}
                            >
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-lg font-bold tracking-tight text-foreground">
                                {displayName}
                            </span>
                            <span className="text-xs text-muted-foreground">
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
                </section>

                <section className="mt-8 flex flex-col gap-4">
                    <SectionTitle>{t('profile.account')}</SectionTitle>
                    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                        <ProfileField label={t('profile.name')} value={name} />
                        <ProfileField label={t('profile.email')} value={email} />
                        <ProfileField
                            label={t('profile.id')}
                            value={uid}
                            onCopy={userId ? handleCopyUid : undefined}
                            copied={copied}
                            copyLabel={t('profile.copy')}
                            copiedLabel={t('profile.copied')}
                        />
                    </div>
                    {showSocialLogin && (
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-sm font-medium text-foreground">{t('profile.signInGoogle')}</span>
                                <span className="text-xs text-muted-foreground">{t('profile.signInGoogleHint')}</span>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 gap-2"
                                onClick={() => startSocialLogin('google')}
                            >
                                <GoogleIcon />
                                {t('auth.social.google')}
                            </Button>
                        </div>
                    )}
                </section>
            </div>

            <EditPlaceProfileDialog />
        </div>
    );
};
