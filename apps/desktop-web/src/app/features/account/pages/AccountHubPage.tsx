import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { isPlaceholderName, PageShell, SettingsNavRow, SettingsRowGroup, useRelayAccount } from '../../../shared';
import { isPhoneLoginEnabled, isSocialLoginEnabled } from '../../auth';
import { useJoinDialogStore } from '../../auth/stores/useJoinDialogStore';
import { isDevicePairingEnabled } from '../../pairing/utils/devicePairing';
import { AccountProfileDialog } from '../components/AccountProfileDialog';
import { AccountSignInCard } from '../components/AccountSignInCard';
import { linkedSignInOf } from '../utils/linkedSignIn';

/**
 * The account hub: the relay identity card (with profile edit), how the
 * account signs in, and the entries that lead out of it — owned clouds,
 * notifications (the Settings page) and the terms and privacy policy. A guest
 * (no relay user, or one whose role is `guest`) gets a join prompt instead of
 * the card (or, where a sign-in is on, the sign-in card with the join link in it), and the clouds entry
 * is hidden.
 */
export const AccountHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { account } = useRelayAccount();
    const isGuest = !account || account.userRole === 'guest';
    // An account that never set a name carries a bare UUID; show it, and prefill the edit, as unnamed.
    const profile = useMemo(
        () => (account && isPlaceholderName(account.name) ? { ...account, name: '' } : account),
        [account]
    );
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const [editingProfile, setEditingProfile] = useState(false);
    // A guest who can sign in gets one card: the sign-in card carries the invite link too, so the two
    // ways out of being a guest are not two cards competing with no order between them.
    // With no relay user yet the sign-in card draws nothing, so the plain guest card stays for that.
    const guestCanSignIn =
        linkedSignInOf(account).kind === 'guest' && (isSocialLoginEnabled() || isPhoneLoginEnabled());

    return (
        // Back returns to Settings, the hub's parent — it used to land in chat,
        // dropping the Settings page the hub was reached from.
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

                {/* One list, not equal-weight cards: each entry is a whole-row
                    hit target. The notifications entry is gone — it linked into
                    Settings and back with no new information, and Settings is
                    reached from the account menu instead. */}
                <SettingsRowGroup>
                    {!isGuest && (
                        <SettingsNavRow
                            label={t('cloud.list.title')}
                            hint={t('cloud.list.openHint')}
                            onClick={() => navigate('/account/clouds')}
                        />
                    )}
                    {/* A guest's only device is this one, and it has no approvals to withdraw. */}
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
