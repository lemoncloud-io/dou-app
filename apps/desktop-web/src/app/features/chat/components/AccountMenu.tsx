import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { User } from 'lucide-react';

import { runtime } from '@chatic/app-runtime';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { useJoinDialogStore } from '../../auth';
import { PairingLogoutDialog } from '../../pairing/components/PairingLogoutDialog';
import { isDevicePairingEnabled } from '../../pairing/utils/devicePairing';
import {
    isRelayGuest,
    useAccountName,
    useAccountResetOnLogout,
    useDebugModeStore,
    useDisplayProfile,
} from '../../../shared';

/**
 * The signed-in user's avatar and menu, pinned to the bottom of the nav rail: profile, account,
 * joining with an invite, settings, the debug overlay when it is on, and logging out.
 */
export const AccountMenu = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const { userId, delegatorId } = runtime.session.useSessionIdentity();
    const { photo } = runtime.session.useRuntimeProfile();
    const accountName = useAccountName();
    const logout = runtime.session.useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();
    // A guest account lives on this device and nothing can sign back into it, so
    // logging out of one is a delete. A main account can always come back.
    const { isGuest } = runtime.session.useRuntimeProfile();
    const [confirmingLogout, setConfirmingLogout] = useState(false);
    const debugEnabled = useDebugModeStore(s => s.enabled);
    const openDebugPanel = useDebugModeStore(s => s.setOverlayOpen);

    const signOut = () => void resetAccount().finally(() => logout());
    // An approving app first ends the web sign-ins it approved, with a confirm when there are any.
    const pairingLogout = runtime.session.usePairingAwareLogout(signOut);
    const runLogout = () => (isDevicePairingEnabled() ? void pairingLogout.start() : signOut());
    // Joining exchanges the code under the guest id the device registered (`delegatorId`). A
    // sign-in on desktop links that guest rather than replacing it, so a signed-in account keeps the
    // id and the server follows it back to the guest for the invited cloud. Only an account with no
    // such id has nothing to join under — the exchange refuses it after the code.
    const canJoinWithInvite = isRelayGuest() || !!delegatorId;

    // Self Display Profile: show my Place nick/photo here when set for this place.
    const { name: selfName, thumbnail: userPhoto } = useDisplayProfile(userId ?? '', accountName, photo);
    const userInitial = selfName.charAt(0).toUpperCase();

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    aria-label={selfName ? t('rail.menu.accountMenu', { name: selfName }) : t('rail.menu.profile')}
                    className="group relative shrink-0 transition-transform duration-150 ease-tactile tactile focus-ring rounded-full"
                >
                    {/* Figma "1-person Profile": the navy disc and green presence dot are
                        fixed in both themes — see --profile-disc / --presence-online. */}
                    <Avatar className="h-12 w-12 rounded-full">
                        {userPhoto && <AvatarImage src={userPhoto} alt={selfName} className="rounded-full" />}
                        <AvatarFallback className="rounded-full bg-profile-disc text-heading font-semibold text-profile-disc-foreground">
                            {userInitial || <User size={17} aria-hidden />}
                        </AvatarFallback>
                    </Avatar>
                    {/* presence dot — signals "you, signed in" so the slot reads intentional, not empty */}
                    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-rail-elevated bg-presence-online" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" sideOffset={6}>
                    {/* Who acts here: the account name and its kind. */}
                    <DropdownMenuLabel className="flex flex-col gap-0.5">
                        <span className="truncate text-callout font-medium text-foreground">
                            {selfName || t('rail.menu.profile')}
                        </span>
                        <span className="text-caption text-muted-foreground">
                            {isGuest ? t('profile.guestName') : t('account.title')}
                        </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/profile')}>{t('rail.menu.profile')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/account')}>{t('rail.menu.account')}</DropdownMenuItem>
                    {canJoinWithInvite && (
                        <DropdownMenuItem onClick={openJoinDialog}>{t('rail.menu.join')}</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/settings')}>{t('rail.menu.settings')}</DropdownMenuItem>
                    {/* A tool, not an account action: its own group, away from Log out. */}
                    {(import.meta.env.DEV || debugEnabled) && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDebugPanel(true)}>
                                {t('rail.menu.debug')}
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => (isGuest ? setConfirmingLogout(true) : runLogout())}>
                        {t('rail.menu.logout')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <PairingLogoutDialog logout={pairingLogout} />
            {/* A guest logout is a delete: the safe way out (connect the account)
                comes first, and the destructive choice is named for what it is. */}
            <AlertDialog open={confirmingLogout} onOpenChange={setConfirmingLogout}>
                <AlertDialogContent className="sm:max-w-sm">
                    <AlertDialogTitle>{t('rail.menu.logoutGuest.title')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('rail.menu.logoutGuest.description')}</AlertDialogDescription>
                    <AlertDialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setConfirmingLogout(false);
                                navigate('/account');
                            }}
                        >
                            {t('rail.menu.logoutGuest.connect')}
                        </Button>
                        <AlertDialogAction
                            onClick={runLogout}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {t('rail.menu.logoutGuest.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
