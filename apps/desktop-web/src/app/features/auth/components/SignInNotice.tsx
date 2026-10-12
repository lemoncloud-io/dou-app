import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isPlaceholderName, useRelayAccount, useAccountResetOnLogout } from '../../../shared';
import { runtime } from '@chatic/app-runtime';
import { takeSignInNotice, type SignInNoticeRecord as Notice } from '../utils/signInNotice';
import { NewAccountName } from './NewAccountName';

/**
 * Says who a Google sign-in landed as, once, when the signed-in app comes up after it. An existing
 * account gets a toast with its name. A new one gets a stop: the Google had no DoU account, so someone
 * who signed up on mobile with a phone number has just made a second account by mistake, and is offered
 * to log out of it before anything is written to it. Otherwise it asks for the new account's name.
 */
export const SignInNotice = () => {
    const { t } = useTranslation();
    const { account } = useRelayAccount();
    const logout = runtime.session.useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();
    const [notice, setNotice] = useState<Notice | null>(null);

    useEffect(() => {
        setNotice(takeSignInNotice());
    }, []);

    const name = account?.name && !isPlaceholderName(account.name) ? account.name : null;
    useEffect(() => {
        if (!notice || notice.isNew) return;
        toast({ description: name ? t('auth.social.signedInAs', { name }) : t('auth.social.signedIn') });
        setNotice(null);
    }, [notice, name, t]);

    if (!notice?.isNew) return null;
    const close = () => setNotice(null);
    const notMine = () => void resetAccount().finally(() => logout());

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
