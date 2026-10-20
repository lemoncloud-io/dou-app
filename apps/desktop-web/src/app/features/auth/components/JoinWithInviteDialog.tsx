import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';

import { useInviteLogin } from '../hooks/useInviteLogin';
import { useJoinDialogStore } from '../stores';
import { inviteLoginErrorText } from '../utils';

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
    const { login, isSubmitting, error, clearError } = useInviteLogin();
    const [code, setCode] = useState('');

    // The dialog stays mounted while closed, so the last failure is cleared on the way out too —
    // otherwise reopening it greets the next attempt with the previous one's error.
    const reset = () => {
        setCode('');
        clearError();
    };

    const handleCodeChange = (next: string) => {
        setCode(next);
        clearError();
    };

    const handleOpenChange = (next: boolean) => {
        // Escape, the X and the backdrop are ignored while the invite is being redeemed, as in
        // Rename and AddMembers: a closed dialog has nowhere to show the failure.
        if (next || isSubmitting) return;
        reset();
        close();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        const failure = await login(code);
        if (!failure) {
            reset();
            close();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('auth.join.title')}</DialogTitle>
                <DialogDescription>{t('auth.join.subtitle')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <Input
                        autoFocus
                        value={code}
                        onChange={e => handleCodeChange(e.target.value)}
                        placeholder={t('auth.invite.placeholder')}
                        aria-label={t('auth.invite.placeholder')}
                        disabled={isSubmitting}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? 'join-invite-error' : undefined}
                    />
                    {error && (
                        <div id="join-invite-error" role="alert" className="-mt-1 flex flex-col gap-1">
                            <p className="text-callout text-destructive">{inviteLoginErrorText(error, t)}</p>
                            {/* The server's own words: the toast carries them too, but this is
                                where the person is looking. */}
                            {error.kind === 'server' && error.message && (
                                <p className="break-all font-mono text-caption text-muted-foreground">
                                    {error.message}
                                </p>
                            )}
                        </div>
                    )}
                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !code.trim()}>
                            {isSubmitting ? t('auth.invite.preparing') : t('auth.invite.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
