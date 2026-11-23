import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { FormError, FormField } from '../../../shared';

import type { MiniAppUrlSave, useMiniAppLauncher } from '../hooks/useMiniAppLauncher';

export const MiniAppDialogs = ({ launcher }: { launcher: ReturnType<typeof useMiniAppLauncher> }) => (
    <>
        <MiniAppLinkDialog
            open={launcher.editSeed !== null}
            stored={launcher.editSeed ?? ''}
            onClose={launcher.closeEditing}
            onSave={launcher.saveUrl}
        />
        <MiniAppConsentDialog host={launcher.pendingConsentHost} onAnswer={launcher.answerConsent} />
    </>
);

const saveError: Record<Exclude<MiniAppUrlSave, 'saved'>, string> = {
    invalidUrl: 'settings.miniApp.linkInvalid',
    hubUrl: 'settings.miniApp.linkIsHub',
    failed: 'settings.miniApp.linkSaveFailed',
};

type MiniAppLinkFormProps = {
    stored: string;
    onClose: () => void;
    onSave: (url: string) => Promise<MiniAppUrlSave>;
};

const MiniAppLinkDialog = ({ open, ...props }: { open: boolean } & MiniAppLinkFormProps) => {
    const { t } = useTranslation();
    return (
        <Dialog open={open} onOpenChange={next => !next && props.onClose()}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('settings.miniApp.link')}</DialogTitle>
                <DialogDescription>{t('settings.miniApp.linkHint')}</DialogDescription>
                <MiniAppLinkForm {...props} />
            </DialogContent>
        </Dialog>
    );
};

const MiniAppLinkForm = ({ stored, onClose, onSave }: MiniAppLinkFormProps) => {
    const { t } = useTranslation();
    const [url, setUrl] = useState(stored);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async (next: string) => {
        if (saving) {
            return;
        }
        setSaving(true);
        let outcome: MiniAppUrlSave;
        try {
            outcome = await onSave(next);
        } finally {
            setSaving(false);
        }
        if (outcome !== 'saved') {
            setError(t(saveError[outcome]));
            return;
        }
        toast({ title: t(next.trim() ? 'settings.miniApp.linkSaved' : 'settings.miniApp.linkRemoved') });
        onClose();
    };

    return (
        <form
            onSubmit={event => {
                event.preventDefault();
                void submit(url);
            }}
            className="flex flex-col gap-4 pt-2"
        >
            <FormField
                label={t('settings.miniApp.linkLabel')}
                htmlFor="mini-app-link"
                errorId="mini-app-link-error"
                invalid={error != null}
            >
                <Input
                    id="mini-app-link"
                    type="url"
                    autoFocus
                    value={url}
                    onChange={e => {
                        setUrl(e.target.value);
                        setError(null);
                    }}
                    placeholder="https://"
                />
            </FormField>
            {error && <FormError id="mini-app-link-error">{error}</FormError>}
            <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                {stored && (
                    <Button
                        type="button"
                        variant="outline"
                        className="text-destructive sm:mr-auto"
                        disabled={saving}
                        onClick={() => void submit('')}
                    >
                        {t('settings.miniApp.remove')}
                    </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose}>
                    {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={saving}>
                    {t('settings.miniApp.save')}
                </Button>
            </DialogFooter>
        </form>
    );
};

const MiniAppConsentDialog = ({ host, onAnswer }: { host: string | null; onAnswer: (agreed: boolean) => void }) => {
    const { t } = useTranslation();
    return (
        <AlertDialog open={host !== null} onOpenChange={next => !next && onAnswer(false)}>
            <AlertDialogContent className="sm:max-w-sm">
                <AlertDialogTitle>{t('settings.miniApp.consentTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                    {t('settings.miniApp.consentBody', { host: host ?? '' })}
                </AlertDialogDescription>
                <AlertDialogFooter className="gap-2 pt-2 sm:space-x-0">
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onAnswer(true)}>
                        {t('settings.miniApp.consentAgree')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
