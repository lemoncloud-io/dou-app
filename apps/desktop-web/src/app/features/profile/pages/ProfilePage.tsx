import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { avatarStyle, useCopyToClipboard } from '../../../shared';

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

export const ProfilePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const profile = useWebCoreStore(s => s.profile);
    const [copied, copy] = useCopyToClipboard();

    const user = profile?.$user;
    const fallback = t('profile.unknown');
    const name = user?.name ?? fallback;
    const email = user?.email ?? fallback;
    const uid = profile?.uid ?? fallback;
    const photo = user?.photo ?? '';
    const initial = (user?.name ?? '?').charAt(0).toUpperCase();

    const handleCopyUid = () => {
        if (profile?.uid) copy(profile.uid);
    };

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                    {t('profile.back')}
                </Button>
                <h1 className="text-base font-semibold text-foreground">{t('profile.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <div className="mb-8 flex items-center gap-4">
                    <Avatar className="h-20 w-20 ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
                        {photo && <AvatarImage src={photo} alt={name} />}
                        <AvatarFallback className="text-2xl font-semibold" style={avatarStyle(profile?.uid || name)}>
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-xl font-bold tracking-tight text-foreground">{name}</span>
                        {email !== fallback && <span className="truncate text-sm text-muted-foreground">{email}</span>}
                    </div>
                </div>

                <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                    <ProfileField label={t('profile.name')} value={name} />
                    <ProfileField label={t('profile.email')} value={email} />
                    <ProfileField
                        label={t('profile.id')}
                        value={uid}
                        onCopy={profile?.uid ? handleCopyUid : undefined}
                        copied={copied}
                        copyLabel={t('profile.copy')}
                        copiedLabel={t('profile.copied')}
                    />
                </div>
            </div>
        </div>
    );
};
