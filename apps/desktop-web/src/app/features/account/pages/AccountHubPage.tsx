import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button, Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit';
import { SettingsNavRow, SettingsRowGroup } from '@chatic/design-system-components-desktop';

import { isPlaceholderName, PageShell, useRelayAccount } from '../../../shared';
import { isPhoneLoginEnabled, isSocialLoginEnabled } from '../../auth';
import { useJoinDialogStore } from '../../auth/stores/useJoinDialogStore';
import { isDevicePairingEnabled } from '../../pairing/utils/devicePairing';
import { AccountProfileDialog } from '../components/AccountProfileDialog';
import { AccountSignInCard } from '../components/AccountSignInCard';
import { linkedSignInOf } from '../utils/linkedSignIn';

export const AccountHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { account } = useRelayAccount();
    const isGuest = !account || account.userRole === 'guest';
    const profile = useMemo(
        () => (account && isPlaceholderName(account.name) ? { ...account, name: '' } : account),
        [account]
    );
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const [editingProfile, setEditingProfile] = useState(false);
    const guestCanSignIn =
        linkedSignInOf(account).kind === 'guest' && (isSocialLoginEnabled() || isPhoneLoginEnabled());

    return (
        <PageShell title={t('account.title')} backTo="/settings" backLabel={t('settings.title')}>
            <section className="flex flex-col gap-4">
                {profile && !isGuest ? (
                    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
                        <Avatar className="h-14 w-14">
                            <AvatarImage src={profile.photo || undefined} alt="" />
                            <AvatarFallback>
                                {(profile.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-heading text-foreground">
                                {profile.name || t('account.unnamed')}
                            </span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)}>
                            {t('account.editProfile')}
                        </Button>
                    </div>
                ) : guestCanSignIn ? null : (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
                        <p className="text-heading text-foreground">{t('account.guestTitle')}</p>
                        <p className="max-w-xs text-caption text-muted-foreground">{t('account.guestBody')}</p>
                        <Button variant="outline" size="sm" onClick={openJoinDialog}>
                            {t('account.join')}
                        </Button>
                    </div>
                )}

                <AccountSignInCard account={account} onJoin={openJoinDialog} />

                <SettingsRowGroup>
                    {!isGuest && (
                        <SettingsNavRow
                            label={t('cloud.list.title')}
                            hint={t('cloud.list.openHint')}
                            onClick={() => navigate('/account/clouds')}
                        />
                    )}
                    {!isGuest && isDevicePairingEnabled() && (
                        <SettingsNavRow
                            label={t('pairing.devices.entry')}
                            hint={t('pairing.devices.entryHint')}
                            onClick={() => navigate('/account/devices')}
                        />
                    )}
                    <SettingsNavRow
                        label={t('policy.list.title')}
                        hint={t('policy.list.openHint')}
                        onClick={() => navigate('/account/policies')}
                    />
                </SettingsRowGroup>
            </section>

            {profile && !isGuest && (
                <AccountProfileDialog open={editingProfile} onOpenChange={setEditingProfile} initial={profile} />
            )}
        </PageShell>
    );
};
