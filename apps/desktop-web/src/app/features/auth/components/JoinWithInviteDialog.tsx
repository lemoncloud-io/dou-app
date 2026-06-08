import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';

import { useInviteLogin } from '../hooks/useInviteLogin';
import { useJoinDialogStore } from '../stores';

/**
 * In-app "join a workspace" dialog for an already-authenticated (e.g. guest)
 * session. Reuses the invite-code flow; on success the rail picks up the new
 * cloud, so the dialog just closes — no navigation. The unauthenticated invite
 * path stays a full-screen page (InviteLoginPage / AuthCard).
 */
export const JoinWithInviteDialog = () => {
    const { t } = useTranslation();
    const isOpen = useJoinDialogStore(s => s.isOpen);
    const close = useJoinDialogStore(s => s.close);
    const { login, isSubmitting, isError } = useInviteLogin();
    const [code, setCode] = useState('');

    const reset = () => setCode('');

    const handleOpenChange = (next: boolean) => {
        if (next) return;
        reset();
        close();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        const ok = await login(code);
        if (ok) {
            reset();
            close();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{t('auth.join.title')}</DialogTitle>
                <DialogDescription>{t('auth.join.subtitle')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <Input
                        autoFocus
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        placeholder={t('auth.invite.placeholder')}
                        aria-label={t('auth.invite.placeholder')}
                        disabled={isSubmitting}
                    />
                    {isError && <p className="-mt-1 text-sm text-destructive">{t('auth.invite.failed')}</p>}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !code.trim()}>
                            {isSubmitting ? t('auth.invite.preparing') : t('auth.invite.submit')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
