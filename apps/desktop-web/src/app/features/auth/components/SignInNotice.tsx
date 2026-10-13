import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isPlaceholderName, useRelayAccount } from '../../../shared';
import { useSignOutGuest } from '../hooks/useSignOutGuest';
import { useSignInNoticeStore } from '../stores/useSignInNoticeStore';
import { NewAccountName } from './NewAccountName';

/**
 * Says who a Google sign-in landed as, once, when the signed-in app comes up after it. An existing
 * account gets a toast with its name. A new one gets a stop: the Google had no DoU account, so someone
 * who signed up on mobile with a phone number has just made a second account by mistake, and is offered
 * to log out of it before anything is written to it. Otherwise it asks for the new account's name.
 */
export const SignInNotice = () => {
    const { t } = useTranslation();
    const { account, isRelayVerified } = useRelayAccount();
    // Leaving an account made seconds ago: nothing in it to confirm, the same sign-out as a guest's.
    const signOut = useSignOutGuest();
    const notice = useSignInNoticeStore(s => s.notice);
    const pick = useSignInNoticeStore(s => s.pick);
    const take = useSignInNoticeStore(s => s.take);
    const clear = useSignInNoticeStore(s => s.clear);

    // The store took what was in storage when the app loaded; this picks up one left since.
    useEffect(() => pick(), [pick]);

    const name = account?.name && !isPlaceholderName(account.name) ? account.name : null;
    // Said once the relay connection is verified as the signed-in account, so the name is its own.
    useEffect(() => {
        if (!notice || notice.isNew || !isRelayVerified || !take()) return;
        toast({ description: name ? t('auth.social.signedInAs', { name }) : t('auth.social.signedIn') });
    }, [notice, name, isRelayVerified, t, take]);

    if (!notice?.isNew) return null;
    const close = clear;
    const notMine = () => void signOut();

    return (
        <Dialog open>
            {/* Left only through its buttons: dismissing it by Escape or a stray click would take away
                "not my account" before the person has read why it is here. */}
            <DialogContent
                hideClose
                className="sm:max-w-md"
                onEscapeKeyDown={e => e.preventDefault()}
                onPointerDownOutside={e => e.preventDefault()}
            >
                <DialogTitle>{t('auth.phone.newAccountTitle')}</DialogTitle>
                <DialogDescription className="break-keep">{t('auth.social.newAccountBody')}</DialogDescription>
                <NewAccountName
                    onDone={close}
                    secondary={
                        <Button type="button" variant="ghost" onClick={notMine}>
                            {t('auth.social.notMine')}
                        </Button>
                    }
                />
            </DialogContent>
        </Dialog>
    );
};
