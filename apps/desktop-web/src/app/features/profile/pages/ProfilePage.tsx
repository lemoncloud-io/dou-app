import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';

interface ProfileFieldProps {
    label: string;
    value: string;
}

const ProfileField = ({ label, value }: ProfileFieldProps) => (
    <div className="flex flex-col gap-1 border-b border-border py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm text-foreground">{value}</span>
    </div>
);

export const ProfilePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const profile = useWebCoreStore(s => s.profile);

    const user = profile?.$user;
    const fallback = t('profile.unknown');
    const name = user?.name ?? fallback;
    const email = user?.email ?? fallback;
    const uid = profile?.uid ?? fallback;
    const photo = user?.photo ?? '';
    const initial = (user?.name ?? '?').charAt(0).toUpperCase();

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                    {t('profile.back')}
                </Button>
                <h1 className="text-base font-semibold text-foreground">{t('profile.title')}</h1>
            </header>

            <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <div className="mb-8 flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                        {photo && <AvatarImage src={photo} alt={name} />}
                        <AvatarFallback className="text-lg font-semibold">{initial}</AvatarFallback>
                    </Avatar>
                    <span className="text-lg font-semibold text-foreground">{name}</span>
                </div>

                <div className="flex flex-col">
                    <ProfileField label={t('profile.name')} value={name} />
                    <ProfileField label={t('profile.email')} value={email} />
                    <ProfileField label={t('profile.id')} value={uid} />
                </div>
            </div>
        </div>
    );
};
