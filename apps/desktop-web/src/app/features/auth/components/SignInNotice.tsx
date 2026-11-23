import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isPlaceholderName, useRelayAccount } from '../../../shared';
import { useSignOutGuest } from '../hooks/useSignOutGuest';
import { useSignInNoticeStore } from '../stores/useSignInNoticeStore';
import { oauthProviderName } from '../utils/oauth';
import { NewAccountName } from './NewAccountName';

export const SignInNotice = () => {
    const { t } = useTranslation();
    const { account, isRelayVerified } = useRelayAccount();
    const signOut = useSignOutGuest();
    const notice = useSignInNoticeStore(s => s.notice);
    const pick = useSignInNoticeStore(s => s.pick);
    const take = useSignInNoticeStore(s => s.take);
    const clear = useSignInNoticeStore(s => s.clear);

    useEffect(() => pick(), [pick]);

    const name = account?.name && !isPlaceholderName(account.name) ? account.name : null;
    useEffect(() => {
        if (!notice || notice.isNew || !isRelayVerified || !take()) return;
        const provider = oauthProviderName(notice.provider);
        toast({ description: name ? t('auth.social.signedInAs', { name }) : t('auth.social.signedIn', { provider }) });
    }, [notice, name, isRelayVerified, t, take]);

    if (!notice?.isNew) return null;
    const close = clear;
    const notMine = () => void signOut();

    return (
        <Dialog open>
            <DialogContent
                hideClose
                className="sm:max-w-md"
                onEscapeKeyDown={e => e.preventDefault()}
                onPointerDownOutside={e => e.preventDefault()}
            >
                <DialogTitle>{t('auth.phone.newAccountTitle')}</DialogTitle>
                <DialogDescription className="break-keep">
                    {t('auth.social.newAccountBody', { provider: oauthProviderName(notice.provider) })}
                </DialogDescription>
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
