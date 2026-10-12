import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { useRelayAccount } from '../../../shared';
import { useJoinDialogStore } from '../../auth/stores/useJoinDialogStore';
import { AccountProfileDialog } from '../components/AccountProfileDialog';
import { AccountSignInCard } from '../components/AccountSignInCard';

/**
 * The account hub: the relay identity card (with profile edit), how the
 * account signs in, and the entries that lead out of it — owned clouds,
 * notifications (the Settings page) and the terms and privacy policy. A guest
 * (no relay user, or one whose role is `guest`) gets a join prompt instead of
 * the card, and the clouds entry is hidden.
 */
export const AccountHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { account } = useRelayAccount();
    const isGuest = !account || account.userRole === 'guest';
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const [editingProfile, setEditingProfile] = useState(false);

    return (
        <div className="flex h-full flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => navigate('/')}>
                    <ChevronLeft className="h-4 w-4" />
                    {t('settings.back')}
                </Button>
                <h1 className="text-heading text-foreground">{t('account.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <section className="flex flex-col gap-4">
                    {account && !isGuest ? (
                        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
                            <Avatar className="h-14 w-14">
                                <AvatarImage src={account.photo || undefined} alt="" />
                                <AvatarFallback>
                                    {(account.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="truncate text-heading text-foreground">
                                    {account.name || t('account.unnamed')}
                                </span>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)}>
                                {t('account.editProfile')}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
                            <p className="text-heading text-foreground">{t('account.guestTitle')}</p>
                            <p className="max-w-xs text-caption text-muted-foreground">{t('account.guestBody')}</p>
                            <Button variant="outline" size="sm" onClick={openJoinDialog}>
                                {t('account.join')}
                            </Button>
                        </div>
                    )}

                    <AccountSignInCard account={account} />

                    {!isGuest && (
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-callout font-medium text-foreground">
                                    {t('cloud.list.title')}
                                </span>
                                <span className="text-caption text-muted-foreground">{t('cloud.list.openHint')}</span>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => navigate('/account/clouds')}>
                                {t('account.open')}
                            </Button>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-callout font-medium text-foreground">
                                {t('settings.notificationsTitle')}
                            </span>
                            <span className="text-caption text-muted-foreground">
                                {t('settings.notificationsHint')}
                            </span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
                            {t('account.open')}
                        </Button>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-callout font-medium text-foreground">{t('policy.list.title')}</span>
                            <span className="text-caption text-muted-foreground">{t('policy.list.openHint')}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => navigate('/account/policies')}>
                            {t('account.open')}
                        </Button>
                    </div>
                </section>
            </div>

            {account && !isGuest && (
                <AccountProfileDialog open={editingProfile} onOpenChange={setEditingProfile} initial={account} />
            )}
        </div>
    );
};
